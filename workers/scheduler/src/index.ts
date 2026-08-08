import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from '../../../functions/_shared/env';
import { getSql } from '../../../functions/_shared/db';
import { chatCompleteJson } from '../../../functions/_shared/openai';
import { buildBrandContext, getBrandVoice } from '../../../functions/_shared/prompts';
import { generatePlatformPost, saveGeneratedContent, findBrandAgent } from '../../../functions/_shared/generate';
import { getThreadsAccount, publishThreadsPost } from '../../../functions/_shared/threads';
import { logActivity } from '../../../functions/_shared/activity';
import { fetchGoogleTrendsTW, fetchGoogleNews, fetchTaiwanNews, fetchPttBoard, fetchDcard, type TrendItem } from './sources';

// 每品牌的議題來源設定;filterKeywords 用於從一般新聞中挑出行業相關文章
const BRAND_SOURCES: Record<string, { newsQuery: string; filterKeywords: string[]; pttBoard?: string; dcardForum?: string }> = {
  homigo: {
    newsQuery: '租屋 OR 租金補貼 OR 包租代管 OR 房東 房客',
    filterKeywords: ['租屋', '租金', '房東', '房客', '租客', '包租', '社宅', '房市', '押金', '租約', '囤房'],
    pttBoard: 'home-sale', dcardForum: 'rent',
  },
  taskgo: {
    newsQuery: '裝修 OR 室內裝潢 OR 工班 OR 老屋翻新',
    filterKeywords: ['裝修', '裝潢', '工班', '翻新', '缺工', '工地', '建材', '室內設計', '水電', '漏水'],
    pttBoard: 'Interior', dcardForum: 'interior_design',
  },
  washgo: {
    newsQuery: '洗衣店 OR 乾洗 OR 衣物保養 OR 換季收納',
    filterKeywords: ['洗衣', '乾洗', '衣物', '棉被', '羽絨', '換季', '收納', '梅雨', '潮濕', '黴'],
    dcardForum: 'life',
  },
};

const AUTO_DRAFT_THRESHOLD = 0.75;
// AI 給分低於此門檻的議題不入庫,避免塞入無關時事
const MIN_RELEVANCE = 0.6;
// 每品牌每輪最多寫入的情報數(控制 Workers 子請求數量)
const MAX_SIGNALS_PER_BRAND = 3;

interface SignalSelection {
  index: number;
  relevance: number;
  signalType: string;
  summary: string;
}

const VALID_SIGNAL_TYPES = ['news', 'policy', 'current_event', 'trending_topic', 'industry_trend', 'social_content', 'evergreen'];

async function findMarketAnalystAgent(env: Env): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE r.code = 'market_analyst' AND a.is_active = true
    LIMIT 1
  `;
  return rows.length ? (rows[0] as { id: string }).id : null;
}

// ============================================================================
// 主流程 1:蒐集熱門議題 → AI 依品牌篩選 → 寫入 market_signals → 高分自動生成草稿
// ============================================================================
async function collectSignals(env: Env): Promise<void> {
  const sql = getSql(env);
  const brands = await sql`SELECT id, slug, name FROM brands WHERE is_active = true`;
  const [trends, generalNews] = await Promise.all([fetchGoogleTrendsTW(), fetchTaiwanNews()]);
  const analystId = await findMarketAnalystAgent(env);

  for (const brand of brands as { id: string; slug: string; name: string }[]) {
    try {
      const config = BRAND_SOURCES[brand.slug] ?? { newsQuery: brand.name, filterKeywords: [] };
      const [news, ptt, dcard] = await Promise.all([
        fetchGoogleNews(config.newsQuery),
        config.pttBoard ? fetchPttBoard(config.pttBoard) : Promise.resolve([]),
        config.dcardForum ? fetchDcard(config.dcardForum) : Promise.resolve([]),
      ]);
      // 一般新聞先做關鍵字預過濾,行業相關的優先進候選;另附少量泛時事讓 AI 判斷跟風空間
      const keywordNews = generalNews.filter((n) => config.filterKeywords.some((k) => n.title.includes(k) || n.snippet?.includes(k)));
      const otherNews = generalNews.filter((n) => !keywordNews.includes(n)).slice(0, 8);
      const seen = new Set<string>();
      const candidates: TrendItem[] = [...news, ...keywordNews, ...ptt, ...dcard, ...trends, ...otherNews]
        .filter((c) => { if (seen.has(c.title)) return false; seen.add(c.title); return true; })
        .slice(0, 40);
      console.log(`[collect] ${brand.slug} 來源統計 trends=${trends.length} gnews=${news.length} 關鍵字新聞=${keywordNews.length} 一般新聞=${otherNews.length} ptt=${ptt.length} dcard=${dcard.length}`);
      if (!candidates.length) continue;

      // 近 14 天已存在的情報標題,避免重複寫入
      const recentRows = await sql`
        SELECT title FROM market_signals
        WHERE brand_id = ${brand.id}::uuid AND discovered_at > now() - interval '14 days'
      `;
      const existingTitles = new Set((recentRows as { title: string }[]).map((r) => r.title));
      const fresh = candidates.filter((c) => !existingTitles.has(c.title));
      if (!fresh.length) continue;

      const voice = getBrandVoice(brand.slug);
      const listText = fresh.map((c, i) => `${i}. [${c.source}] ${c.title}${c.snippet ? ` — ${c.snippet.slice(0, 120)}` : ''}`).join('\n');
      const selection = await chatCompleteJson<{ selections: SignalSelection[] }>(env, {
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: `你是品牌「${brand.name}」的市場情報分析師。${voice.frontlinePersona}\n這個行業關心的議題:${voice.dailyConcerns}`,
          },
          {
            role: 'user',
            content: [
              '以下是剛抓到的熱門議題清單,請挑出對這個品牌社群操作「真正有價值」的項目(最多 5 個;跟行業無關又難跟風的不要選,relevance 至少 0.6 才列入):',
              listText,
              '',
              '回傳 JSON:{"selections":[{"index":清單編號,"relevance":0到1,"signalType":"news|policy|current_event|trending_topic|industry_trend|social_content","summary":"為什麼這議題對品牌有用、可以怎麼切入(80字內)"}]}',
            ].join('\n'),
          },
        ],
      });

      // 依相關性排序,只取前幾名且高於門檻的寫入
      const picked = (selection.selections ?? [])
        .filter((sel) => fresh[sel.index] && sel.relevance >= MIN_RELEVANCE)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, MAX_SIGNALS_PER_BRAND);

      for (const sel of picked) {
        const item = fresh[sel.index];
        const signalType = VALID_SIGNAL_TYPES.includes(sel.signalType) ? sel.signalType : 'trending_topic';
        const inserted = await sql`
          INSERT INTO market_signals (
            brand_id, signal_type, title, summary, source_url, relevance_score,
            status, discovered_by_agent_id, source_platform, raw_data, auto_generated
          ) VALUES (
            ${brand.id}::uuid, ${signalType}, ${item.title}, ${sel.summary},
            ${item.url ?? null}, ${Math.min(1, Math.max(0, sel.relevance))},
            'new', ${analystId}, ${item.source}, ${JSON.stringify(item)}, true
          ) RETURNING id
        `;
        const signalId = (inserted[0] as { id: string }).id;

        await logActivity(env, {
          brandId: brand.id,
          actorType: 'ai_agent',
          actorAgentId: analystId,
          action: 'market_signal.discovered',
          entityType: 'market_signal',
          entityId: signalId,
          afterState: { title: item.title, source: item.source, relevance: sel.relevance },
        });
      }
    } catch (e) {
      console.error(`[collect] 品牌 ${brand.slug} 蒐集失敗`, e);
    }
  }
}

// ============================================================================
// 主流程 1b:高分情報自動生成三平台草稿
// 每次只處理「一則」尚未有草稿的最高分情報,避免超過 Workers 單次子請求上限
// ============================================================================
async function generateSignalDrafts(env: Env): Promise<void> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT ms.id, ms.brand_id, ms.title, ms.summary, b.slug
    FROM market_signals ms
    JOIN brands b ON b.id = ms.brand_id
    WHERE ms.auto_generated = true
      AND ms.relevance_score >= ${AUTO_DRAFT_THRESHOLD}
      AND ms.status = 'new'
      AND ms.discovered_at > now() - interval '48 hours'
      AND NOT EXISTS (SELECT 1 FROM contents c WHERE c.source_market_signal_id = ms.id)
    ORDER BY ms.relevance_score DESC, ms.discovered_at DESC
    LIMIT 1
  `;
  if (!rows.length) return;
  const signal = rows[0] as { id: string; brand_id: string; title: string; summary: string | null; slug: string };
  console.log(`[drafts] 為情報「${signal.title}」(${signal.slug}) 生成三平台草稿`);

  const brandCtx = await buildBrandContext(env, signal.brand_id);
  const agentId = await findBrandAgent(env, signal.brand_id);
  for (const platform of ['facebook', 'instagram', 'threads'] as const) {
    try {
      const result = await generatePlatformPost(env, {
        brandCtx, platform,
        topic: signal.title,
        topicSummary: signal.summary ?? undefined,
      });
      const { contentId } = await saveGeneratedContent(env, {
        brandCtx, platform, result,
        sourceMarketSignalId: signal.id,
        generatedByAgentId: agentId,
        status: 'draft',
        promptMeta: { source: 'auto_signal', signalId: signal.id },
      });
      await logActivity(env, {
        brandId: signal.brand_id,
        actorType: 'ai_agent',
        actorAgentId: agentId,
        action: 'content.generated',
        entityType: 'content',
        entityId: contentId,
        afterState: { platform, auto: true, fromSignal: signal.id },
      });
    } catch (e) {
      console.error(`[drafts] ${signal.slug}/${platform} 草稿生成失敗`, e);
    }
  }
}

// ============================================================================
// 主流程 2:Threads 每 30 分鐘熱門議題貼文
//   - 每 tick 只處理最久沒發 Threads 的 2 個品牌(控制子請求數)
//   - 品牌已連 Threads API 且開啟自動發布 → 直接發布;否則存草稿
// ============================================================================
const THREADS_DAILY_CAP = 30; // 每品牌每日 Threads 貼文上限
const THREADS_BRANDS_PER_TICK = 2;

async function threadsRound(env: Env): Promise<void> {
  const sql = getSql(env);
  const trends = await fetchGoogleTrendsTW(8);
  if (!trends.length) return;

  // 取最久沒產出 Threads 內容的品牌優先
  const brands = await sql`
    SELECT b.id, b.slug, b.name,
           (SELECT max(c.created_at) FROM contents c
            WHERE c.brand_id = b.id AND c.target_platform = 'threads') AS last_at,
           (SELECT count(*)::int FROM contents c
            WHERE c.brand_id = b.id AND c.target_platform = 'threads'
              AND c.created_at > now() - interval '24 hours') AS today_count
    FROM brands b WHERE b.is_active = true
    ORDER BY last_at ASC NULLS FIRST
    LIMIT ${THREADS_BRANDS_PER_TICK}
  `;

  for (const brand of brands as { id: string; slug: string; name: string; today_count: number }[]) {
    if (brand.today_count >= THREADS_DAILY_CAP) continue;
    try {
      const brandCtx = await buildBrandContext(env, brand.id);
      const agentId = await findBrandAgent(env, brand.id);
      const trendList = trends.map((t) => t.title).join('、');

      const result = await generatePlatformPost(env, {
        brandCtx,
        platform: 'threads',
        topic: `台灣現在的熱門話題:${trendList}`,
        extraInstruction:
          '從上面的熱門話題挑「一個」最能跟品牌日常自然掛勾的,寫一則 Threads 跟風文。' +
          '如果全部都掛不上,就寫一則品牌日常 observation 文(第一線工作看到的趣事)。不要硬蹭。',
      });

      const account = await getThreadsAccount(env, brand.id);
      const willAutoPublish = !!account?.autoPublish;

      const { contentId, versionId } = await saveGeneratedContent(env, {
        brandCtx,
        platform: 'threads',
        result,
        generatedByAgentId: agentId,
        status: 'draft',
        promptMeta: { source: 'threads_30min', trends: trends.map((t) => t.title) },
      });

      if (willAutoPublish && account) {
        try {
          const published = await publishThreadsPost(account, { text: result.post.body });
          await sql`
            INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, published_at, external_post_id)
            VALUES (${contentId}::uuid, ${versionId}::uuid, 'threads', 'published', now(),
                    ${published.permalink ?? published.postId})
          `;
          await sql`UPDATE contents SET status = 'published', updated_at = now() WHERE id = ${contentId}::uuid`;
          console.log(`[threads] ${brand.slug} 已自動發布:${published.permalink ?? published.postId}`);
        } catch (pubErr) {
          console.error(`[threads] ${brand.slug} 自動發布失敗,保留草稿`, pubErr);
        }
      }

      await logActivity(env, {
        brandId: brand.id,
        actorType: 'ai_agent',
        actorAgentId: agentId,
        action: 'content.generated',
        entityType: 'content',
        entityId: contentId,
        afterState: { platform: 'threads', auto: true, autoPublished: willAutoPublish },
      });
    } catch (e) {
      console.error(`[threads] 品牌 ${brand.slug} 生成失敗`, e);
    }
  }
}

// ============================================================================
// 主流程 2b:FB/IG 每日主題圖文(每天每品牌 1-2 主題)
//   台灣早上 07:00-09:59 的 */30 tick 觸發;每 tick 只處理一個品牌一個主題
// ============================================================================
const DAILY_THEME_TARGET = 2;

/** 回傳 true 表示這個 tick 已經做了主題生成(呼叫端應跳過 Threads 輪) */
async function generateDailyTheme(env: Env): Promise<boolean> {
  const sql = getSql(env);
  // 台灣今天已生成的主題數(以 daily_theme 內容的 themeKey 去重)
  const brands = await sql`
    SELECT b.id, b.slug, b.name,
           (SELECT count(DISTINCT c.generation_prompt_meta->>'themeKey')::int FROM contents c
            WHERE c.brand_id = b.id
              AND c.generation_prompt_meta->>'source' = 'daily_theme'
              AND c.created_at > date_trunc('day', now() + interval '8 hours') - interval '8 hours') AS theme_count
    FROM brands b WHERE b.is_active = true
    ORDER BY theme_count ASC
    LIMIT 1
  `;
  if (!brands.length) return false;
  const brand = brands[0] as { id: string; slug: string; name: string; theme_count: number };
  if (brand.theme_count >= DAILY_THEME_TARGET) return false;

  try {
    // 近 48 小時高分情報 + 今日已用主題(避免重複)
    const [signalRows, usedThemeRows] = await Promise.all([
      sql`
        SELECT title, summary, relevance_score FROM market_signals
        WHERE brand_id = ${brand.id}::uuid AND discovered_at > now() - interval '48 hours'
        ORDER BY relevance_score DESC LIMIT 6
      `,
      sql`
        SELECT DISTINCT generation_prompt_meta->>'theme' AS theme FROM contents
        WHERE brand_id = ${brand.id}::uuid
          AND generation_prompt_meta->>'source' = 'daily_theme'
          AND created_at > date_trunc('day', now() + interval '8 hours') - interval '8 hours'
      `,
    ]);

    const voice = getBrandVoice(brand.slug);
    const signalText = (signalRows as { title: string; summary: string | null }[])
      .map((s, i) => `${i + 1}. ${s.title}${s.summary ? ` — ${s.summary}` : ''}`)
      .join('\n');
    const usedThemes = (usedThemeRows as { theme: string | null }[]).map((r) => r.theme).filter(Boolean);

    const theme = await chatCompleteJson<{ theme: string; angle: string; summary: string }>(env, {
      temperature: 0.6,
      messages: [
        { role: 'system', content: `你是品牌「${brand.name}」的內容企劃。${voice.frontlinePersona}` },
        {
          role: 'user',
          content: [
            '請從以下近期情報歸納出「一個」今天最值得做 FB+IG 圖文的主題。',
            signalText || '(目前沒有新情報,請從行業日常議題自選一個)',
            usedThemes.length ? `今天已做過的主題(不要重複):${usedThemes.join('、')}` : '',
            `這個行業的日常話題:${voice.dailyConcerns}`,
            '',
            '回傳 JSON:{"theme":"主題標題","angle":"切入角度一句話","summary":"主題背景說明(100字內)"}',
          ].filter(Boolean).join('\n'),
        },
      ],
    });

    const themeKey = `${new Date().toISOString().slice(0, 10)}-${brand.slug}-${brand.theme_count + 1}`;
    const brandCtx = await buildBrandContext(env, brand.id);
    const agentId = await findBrandAgent(env, brand.id);

    for (const platform of ['facebook', 'instagram'] as const) {
      try {
        const result = await generatePlatformPost(env, {
          brandCtx, platform,
          topic: theme.theme,
          topicSummary: theme.summary,
          extraInstruction: `切入角度:${theme.angle}。這是今天的每日主題貼文,FB 與 IG 共用主題但要用各自平台的表達方式。`,
        });
        const { contentId } = await saveGeneratedContent(env, {
          brandCtx, platform, result,
          generatedByAgentId: agentId,
          status: 'pending_review',
          promptMeta: { source: 'daily_theme', theme: theme.theme, themeKey },
        });
        await logActivity(env, {
          brandId: brand.id,
          actorType: 'ai_agent',
          actorAgentId: agentId,
          action: 'content.generated',
          entityType: 'content',
          entityId: contentId,
          afterState: { platform, auto: true, dailyTheme: theme.theme },
        });
      } catch (e) {
        console.error(`[themes] ${brand.slug}/${platform} 主題貼文生成失敗`, e);
      }
    }
    console.log(`[themes] ${brand.slug} 今日主題 #${brand.theme_count + 1}:${theme.theme}`);
    return true;
  } catch (e) {
    console.error(`[themes] 品牌 ${brand.slug} 主題生成失敗`, e);
    return false;
  }
}

// ============================================================================
// */30 統一調度:台灣早上時窗優先補每日主題,其餘時間跑 Threads 輪
// ============================================================================
async function halfHourlyDispatch(env: Env): Promise<void> {
  const twHour = (new Date().getUTCHours() + 8) % 24;
  if (twHour >= 7 && twHour < 10) {
    const didTheme = await generateDailyTheme(env);
    if (didTheme) return; // 主題生成已耗掉大量子請求,這個 tick 不再跑 Threads
  }
  await threadsRound(env);
}

// ============================================================================
// 主流程 3:清理超過 31 天的 R2 生成圖片,控制儲存成長
// ============================================================================
async function cleanupOldMedia(env: Env): Promise<void> {
  if (!env.MEDIA) return;
  const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const listing = await env.MEDIA.list({ prefix: 'generated/', cursor, limit: 500 });
    const oldKeys = listing.objects.filter((o) => o.uploaded.getTime() < cutoff).map((o) => o.key);
    if (oldKeys.length) {
      await env.MEDIA.delete(oldKeys);
      deleted += oldKeys.length;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  if (deleted) console.log(`[cleanup] 已刪除 ${deleted} 個超過 31 天的媒體檔案`);
}

export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    switch (controller.cron) {
      case '15 */3 * * *':
        ctx.waitUntil(collectSignals(env));
        break;
      case '45 * * * *':
        ctx.waitUntil(generateSignalDrafts(env));
        break;
      case '*/30 * * * *':
        ctx.waitUntil(halfHourlyDispatch(env));
        break;
      case '30 18 * * *':
        ctx.waitUntil(cleanupOldMedia(env));
        break;
      default:
        ctx.waitUntil(collectSignals(env));
    }
  },

  // 手動觸發除錯用:GET /?task=collect|drafts|threads|themes|cleanup(需帶 secret)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const task = url.searchParams.get('task');
    const secret = url.searchParams.get('secret');
    if (!secret || secret !== (env.SESSION_SECRET ?? env.ADMIN_PASSWORD)) {
      return new Response('Unauthorized', { status: 401 });
    }
    if (task === 'collect') await collectSignals(env);
    else if (task === 'drafts') await generateSignalDrafts(env);
    else if (task === 'threads') await threadsRound(env);
    else if (task === 'themes') await generateDailyTheme(env);
    else if (task === 'cleanup') await cleanupOldMedia(env);
    else return new Response('task 必須為 collect / drafts / threads / themes / cleanup', { status: 400 });
    return new Response(JSON.stringify({ ok: true, task }), { headers: { 'Content-Type': 'application/json' } });
  },
};
