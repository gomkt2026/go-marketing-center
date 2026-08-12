import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from '../../../functions/_shared/env';
import { getSql } from '../../../functions/_shared/db';
import { chatCompleteJson } from '../../../functions/_shared/openai';
import {
  buildBrandContext, getBrandVoice, ANTI_AI_RULES,
  THREADS_HOURLY_CATEGORIES, pickThreadsHourlyCategory, type ThreadsHourlyCategoryId,
} from '../../../functions/_shared/prompts';
import {
  generatePlatformPost, generateOfftopicPost, generateThreadsFromImage,
  saveGeneratedContent, findBrandAgent, type SocialPlatform,
} from '../../../functions/_shared/generate';
import { getThreadsAccount, publishThreadsPost, searchThreadsPosts, type ThreadsSearchPost } from '../../../functions/_shared/threads';
import { getMetaAccount, publishFacebookPost, publishInstagramPost, composePostMessage } from '../../../functions/_shared/meta';
import { toPublicMediaUrl } from '../../../functions/_shared/media';
import { publishReplyTarget, replyTextIssue } from '../../../functions/_shared/threads-replies';
import { encryptToken, decryptToken } from '../../../functions/_shared/crypto';
import { logActivity } from '../../../functions/_shared/activity';
import { fetchGoogleTrendsTW, fetchGoogleNews, fetchTaiwanNews, fetchPttBoard, fetchDcard, type TrendItem } from '../../../functions/_shared/sources';
import { createPodcastEpisode } from '../../../functions/_shared/podcast';

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
// 主流程 2:Threads 熱門議題貼文(固定 4 檔:台灣 06:00 / 12:00 / 18:00 / 00:00)
//   - 降頻避免被平台判定為機器人:每品牌每天最多 4 篇、每檔間隔 6 小時
//   - 每次處理 2 個品牌;已連 Threads 且開自動發布的品牌(會真正發文)優先
//   - 熱門議題來源:Google Trends TW + 近期自抓的社群情報(PTT/Dcard)
//   - 生成與發布拆開:這裡只生成內容 + 存 scheduled 排程,實際發布交給 publishDueJobs
//     在 scheduled_at(=slotAt,即這篇該發布的時段)到了之後才真正呼叫平台 API
// ============================================================================
const THREADS_DAILY_CAP = 4; // 每品牌每日上限(以排定時段所在的台灣時區當天計)
const THREADS_BRANDS_PER_TICK = 2;
const THREADS_MIN_INTERVAL_MS = 5 * 60 * 60 * 1000; // 每品牌至少間隔 5 小時 → 配合 6 小時一檔

async function generateThreadsSlot(env: Env, slotAt: Date): Promise<void> {
  const sql = getSql(env);
  const trends = await fetchGoogleTrendsTW(8);
  if (!trends.length) return;

  // 會真正發文的品牌(已連 Threads + 開自動發布)優先,其餘品牌輪流補位
  // today_count 只算「品牌相關跟風文」(threads_hourly),不受生活哏文(threads_offtopic)影響
  // recent_categories:最近 2 篇用過的類型(見 THREADS_HOURLY_CATEGORIES),用來排除連續重複的角度(例如連續兩篇都在講換季)
  const brands = await sql`
    SELECT b.id, b.slug, b.name,
           (SELECT max(c.created_at) FROM contents c
            WHERE c.brand_id = b.id AND c.target_platform = 'threads'
              AND c.generation_prompt_meta->>'source' = 'threads_hourly') AS last_at,
           (SELECT count(*)::int FROM contents c
            WHERE c.brand_id = b.id AND c.target_platform = 'threads'
              AND c.generation_prompt_meta->>'source' = 'threads_hourly'
              AND (c.generation_prompt_meta->>'slotAt')::timestamptz >= date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') - interval '8 hours'
              AND (c.generation_prompt_meta->>'slotAt')::timestamptz < date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') + interval '16 hours'
           ) AS today_count,
           (SELECT array_agg(cat) FROM (
              SELECT c.generation_prompt_meta->>'category' AS cat FROM contents c
              WHERE c.brand_id = b.id AND c.target_platform = 'threads'
                AND c.generation_prompt_meta->>'source' = 'threads_hourly'
              ORDER BY c.created_at DESC LIMIT 2
            ) recent) AS recent_categories,
           EXISTS(SELECT 1 FROM brand_social_accounts a
                  WHERE a.brand_id = b.id AND a.platform = 'threads'
                    AND a.status = 'connected' AND a.auto_publish) AS can_publish
    FROM brands b WHERE b.is_active = true
    ORDER BY can_publish DESC, last_at ASC NULLS FIRST
    LIMIT ${THREADS_BRANDS_PER_TICK}
  `;

  for (const brand of brands as {
    id: string; slug: string; name: string; last_at: string | null; today_count: number;
    recent_categories: (string | null)[] | null;
  }[]) {
    if (brand.today_count >= THREADS_DAILY_CAP) continue;
    if (brand.last_at && Date.now() - new Date(brand.last_at).getTime() < THREADS_MIN_INTERVAL_MS) continue;
    try {
      const brandCtx = await buildBrandContext(env, brand.id);
      const agentId = await findBrandAgent(env, brand.id);
      const trendList = trends.map((t) => t.title).join('、');

      // 品牌近期自抓的社群情報(PTT/Dcard 熱門討論)當作社群風向參考
      const socialRows = await sql`
        SELECT title FROM market_signals
        WHERE brand_id = ${brand.id}::uuid
          AND source_platform IN ('ptt', 'dcard')
          AND discovered_at > now() - interval '48 hours'
        ORDER BY relevance_score DESC LIMIT 5
      `;
      const socialTopics = (socialRows as { title: string }[]).map((r) => r.title);

      // 圖片靈感類型:只有品牌智慧素材庫裡有可用圖片時才進候選池;挑最少被用過/最久沒用過的一張,讓庫存輪流曝光
      const imageRows = await sql`
        SELECT id, file_url, caption, image_category FROM brand_assets
        WHERE brand_id = ${brand.id}::uuid AND asset_type = 'image'
        ORDER BY used_in_threads_count ASC, last_used_at ASC NULLS FIRST
        LIMIT 1
      `;
      const candidateImage = imageRows.length
        ? imageRows[0] as { id: string; file_url: string | null; caption: string | null; image_category: string | null }
        : null;

      const recentCategoryIds = (brand.recent_categories ?? []).filter((c): c is string => !!c) as ThreadsHourlyCategoryId[];
      const availableCategoryIds = (candidateImage
        ? THREADS_HOURLY_CATEGORIES
        : THREADS_HOURLY_CATEGORIES.filter((c) => c.id !== 'image_inspired')
      ).map((c) => c.id);
      const category = pickThreadsHourlyCategory(recentCategoryIds, availableCategoryIds);

      let result;
      if (category.id === 'image_inspired' && candidateImage) {
        const publicImageUrl = toPublicMediaUrl(env, candidateImage.file_url);
        if (!publicImageUrl) throw new Error('圖片素材缺少可用網址');
        result = await generateThreadsFromImage(env, {
          brandCtx,
          imageUrl: publicImageUrl,
          caption: candidateImage.caption ?? undefined,
          imageCategory: candidateImage.image_category ?? undefined,
        });
      } else {
        const trendsBlock = [
          `台灣現在的熱門話題:${trendList}`,
          socialTopics.length
            ? `目前社群(PTT/Dcard)正在討論的行業話題,也可以從這裡取材:\n${socialTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
            : '',
        ].filter(Boolean).join('\n\n');
        const topic = category.id === 'seasonal_trend' ? `台灣現在的熱門話題:${trendList}` : `Threads 貼文類型:${category.label}`;
        result = await generatePlatformPost(env, {
          brandCtx,
          platform: 'threads',
          topic,
          extraInstruction: category.instruction.replace('{{TRENDS}}', trendsBlock),
        });
      }

      const account = await getThreadsAccount(env, brand.id);
      const willAutoPublish = !!account?.autoPublish;

      const { contentId, versionId } = await saveGeneratedContent(env, {
        brandCtx,
        platform: 'threads',
        result,
        generatedByAgentId: agentId,
        status: willAutoPublish ? 'scheduled' : 'pending_review',
        promptMeta: {
          source: 'threads_hourly', category: category.id, trends: trends.map((t) => t.title), socialTopics,
          slotAt: slotAt.toISOString(), assetId: category.id === 'image_inspired' && candidateImage ? candidateImage.id : undefined,
        },
        imageAssetMeta: category.id === 'image_inspired' && candidateImage
          ? { sourceAssetId: candidateImage.id, generated: false, reused: true }
          : undefined,
      });

      if (candidateImage && category.id === 'image_inspired') {
        await sql`
          UPDATE brand_assets SET used_in_threads_count = used_in_threads_count + 1, last_used_at = now()
          WHERE id = ${candidateImage.id}::uuid
        `;
      }

      if (willAutoPublish) {
        await sql`
          INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
          VALUES (${contentId}::uuid, ${versionId}::uuid, 'threads', 'scheduled', ${slotAt.toISOString()}::timestamptz)
        `;
      }

      await logActivity(env, {
        brandId: brand.id,
        actorType: 'ai_agent',
        actorAgentId: agentId,
        action: 'content.generated',
        entityType: 'content',
        entityId: contentId,
        afterState: { platform: 'threads', category: category.id, auto: true, scheduled: willAutoPublish, slotAt: slotAt.toISOString() },
      });
      console.log(`[threads] ${brand.slug} 已排定 ${slotAt.toISOString()} 發布(類型:${category.label},${willAutoPublish ? '自動' : '待審核'})`);
    } catch (e) {
      console.error(`[threads] 品牌 ${brand.slug} 生成失敗`, e);
    }
  }
}

// ============================================================================
// 主流程 2d:Threads 生活哏文(跟品牌/系統完全無關,衝自然流量與帳號真實感)
//   - 目前先限定 Washgo(OFFTOPIC_BRANDS),驗證效果後再擴充其他品牌
//   - 固定 2 檔:台灣 09:00 / 21:00,不佔用/不影響品牌相關貼文的 THREADS_DAILY_CAP
//   - 完全不套用品牌語氣與知識庫,純文字、不配圖,見 functions/_shared/prompts.ts 的 OFFTOPIC_SYSTEM_PROMPT
// ============================================================================
const OFFTOPIC_BRANDS = ['washgo']; // 之後要擴充到其他品牌,直接把 slug 加進來即可
const THREADS_OFFTOPIC_DAILY_CAP = 2;

async function generateThreadsOfftopicSlot(env: Env, slotAt: Date): Promise<void> {
  const sql = getSql(env);
  for (const slug of OFFTOPIC_BRANDS) {
    try {
      const brandRows = await sql`SELECT id, slug, name FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1`;
      if (!brandRows.length) continue;
      const brand = brandRows[0] as { id: string; slug: string; name: string };

      const todayRows = await sql`
        SELECT count(*)::int AS n FROM contents
        WHERE brand_id = ${brand.id}::uuid
          AND generation_prompt_meta->>'source' = 'threads_offtopic'
          AND (generation_prompt_meta->>'slotAt')::timestamptz >= date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') - interval '8 hours'
          AND (generation_prompt_meta->>'slotAt')::timestamptz < date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') + interval '16 hours'
      `;
      if ((todayRows[0] as { n: number }).n >= THREADS_OFFTOPIC_DAILY_CAP) continue;

      const usedRows = await sql`
        SELECT title FROM contents
        WHERE brand_id = ${brand.id}::uuid AND generation_prompt_meta->>'source' = 'threads_offtopic'
          AND created_at > now() - interval '14 days'
        ORDER BY created_at DESC LIMIT 20
      `;
      const usedTopics = (usedRows as { title: string }[]).map((r) => r.title);

      const agentId = await findBrandAgent(env, brand.id);
      const result = await generateOfftopicPost(env, { usedTopics });

      const account = await getThreadsAccount(env, brand.id);
      const willAutoPublish = !!account?.autoPublish;

      const { contentId, versionId } = await saveGeneratedContent(env, {
        brandCtx: { brandId: brand.id, slug: brand.slug, name: brand.name, systemPrompt: '' },
        platform: 'threads',
        result,
        generatedByAgentId: agentId,
        status: willAutoPublish ? 'scheduled' : 'pending_review',
        promptMeta: { source: 'threads_offtopic', slotAt: slotAt.toISOString() },
      });

      if (willAutoPublish) {
        await sql`
          INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
          VALUES (${contentId}::uuid, ${versionId}::uuid, 'threads', 'scheduled', ${slotAt.toISOString()}::timestamptz)
        `;
      }

      await logActivity(env, {
        brandId: brand.id,
        actorType: 'ai_agent',
        actorAgentId: agentId,
        action: 'content.generated',
        entityType: 'content',
        entityId: contentId,
        afterState: { platform: 'threads', source: 'threads_offtopic', scheduled: willAutoPublish, slotAt: slotAt.toISOString() },
      });
      console.log(`[offtopic] ${brand.slug} 已排定生活哏文,${slotAt.toISOString()} 發布(${willAutoPublish ? '自動' : '待審核'})`);
    } catch (e) {
      console.error(`[offtopic] 品牌 ${slug} 生成失敗`, e);
    }
  }
}

// ============================================================================
// 主流程 2c:Threads 熱門貼文自動回覆(互動引流)
//   - 每小時輪一個品牌(掛在 :30 的 tick,與發文輪錯開)
//   - Keyword Search(TOP)搜行業關鍵字 → AI 挑最多 2 則寫真人語氣回覆
//   - auto_reply 開啟 → 每輪自動發布 1 則;否則存 pending 待前台審核
//   - 防封號:每日上限、發布失敗即暫停當日、去重、同作者 7 天冷卻、禁連結促銷
// ============================================================================
const REPLY_RELEVANCE_MIN = 0.7;
const REPLY_KEYWORDS_PER_ROUND = 2;    // 每輪最多 2 次 keyword search(保守用搜尋額度)
const REPLY_CANDIDATES_FOR_AI = 6;     // 交給 AI 評估的候選貼文數
const REPLY_MAX_QUEUED_PER_ROUND = 2;  // 每輪最多入庫的回覆數
const REPLY_PENDING_QUEUE_LIMIT = 10;  // 待審佇列滿了就先不生成
const REPLY_MIN_INTERVAL_MS = 20 * 60 * 1000;
const REPLY_MAX_POST_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 不回覆超過 7 天的舊貼文

interface ReplySelection {
  index: number;
  relevance: number;
  reason: string;
  reply: string;
}

async function threadsReplyRound(env: Env): Promise<void> {
  const sql = getSql(env);
  // 最久沒處理的品牌優先;沒接 Threads 的品牌直接跳過,每輪只處理一個品牌
  const brands = await sql`
    SELECT b.id, b.slug, b.name,
           (SELECT max(t.created_at) FROM threads_reply_targets t WHERE t.brand_id = b.id) AS last_at
    FROM brands b WHERE b.is_active = true
    ORDER BY last_at ASC NULLS FIRST
  `;

  for (const brand of brands as { id: string; slug: string; name: string; last_at: string | null }[]) {
    const account = await getThreadsAccount(env, brand.id);
    if (!account) continue;

    try {
      // 當日狀態:回覆數 / 最近失敗 / 待審佇列
      const stateRows = await sql`
        SELECT
          count(*) FILTER (WHERE status = 'replied' AND replied_at > now() - interval '24 hours')::int AS replied_24h,
          max(replied_at) FILTER (WHERE status = 'replied') AS last_replied_at,
          count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '12 hours')::int AS failed_recent,
          count(*) FILTER (WHERE status = 'pending')::int AS pending_count
        FROM threads_reply_targets WHERE brand_id = ${brand.id}::uuid
      `;
      const state = stateRows[0] as { replied_24h: number; last_replied_at: string | null; failed_recent: number; pending_count: number };
      if (state.failed_recent > 0) {
        console.log(`[replies] ${brand.slug} 近 12 小時有發布失敗,本輪暫停`);
        return;
      }
      const capReached = state.replied_24h >= account.replyDailyCap;
      const queueFull = state.pending_count >= REPLY_PENDING_QUEUE_LIMIT;
      if (capReached && (account.autoReply || queueFull)) {
        console.log(`[replies] ${brand.slug} 已達每日上限 ${account.replyDailyCap},本輪跳過`);
        return;
      }

      // 關鍵字:行業關鍵字為主,有跟行業重疊的 Google Trends 熱詞優先
      const config = BRAND_SOURCES[brand.slug] ?? { newsQuery: brand.name, filterKeywords: [brand.name] };
      const baseKeywords = config.filterKeywords.length ? config.filterKeywords : [brand.name];
      let trendKeywords: string[] = [];
      try {
        const trends = await fetchGoogleTrendsTW(10);
        trendKeywords = trends
          .map((t) => t.title)
          .filter((title) => baseKeywords.some((k) => title.includes(k)));
      } catch { /* trends 抓不到不影響 */ }
      const shuffled = [...baseKeywords].sort(() => Math.random() - 0.5);
      const keywords = [...new Set([...trendKeywords, ...shuffled])].slice(0, REPLY_KEYWORDS_PER_ROUND);

      // 搜尋公開貼文(TOP 熱門排序)
      let found: ThreadsSearchPost[] = [];
      for (const kw of keywords) {
        try {
          const posts = await searchThreadsPosts(account, kw, 25);
          found.push(...posts.map((p) => ({ ...p, sourceKeyword: kw }) as ThreadsSearchPost & { sourceKeyword: string }));
        } catch (e) {
          console.error(`[replies] ${brand.slug} 搜尋「${kw}」失敗`, e);
        }
      }
      if (!found.length) {
        console.log(`[replies] ${brand.slug} 沒有搜尋結果(檢查 token 是否有 threads_keyword_search 權限)`);
        return;
      }

      // 過濾:去掉回覆/自家貼文/太舊/太短,並比對已處理過的貼文與 7 天內回覆過的作者
      const ownUsername = (account.username ?? '').toLowerCase();
      const postIds = found.map((p) => p.id);
      const [seenRows, authorRows] = await Promise.all([
        sql`SELECT target_post_id FROM threads_reply_targets WHERE brand_id = ${brand.id}::uuid AND target_post_id = ANY(${postIds})`,
        sql`
          SELECT DISTINCT lower(target_username) AS username FROM threads_reply_targets
          WHERE brand_id = ${brand.id}::uuid AND target_username IS NOT NULL
            AND status IN ('replied', 'pending', 'approved')
            AND created_at > now() - interval '7 days'
        `,
      ]);
      const seenIds = new Set((seenRows as { target_post_id: string }[]).map((r) => r.target_post_id));
      const cooledAuthors = new Set((authorRows as { username: string }[]).map((r) => r.username));
      const uniq = new Set<string>();
      const candidates = (found as (ThreadsSearchPost & { sourceKeyword: string })[])
        .filter((p) => {
          if (uniq.has(p.id)) return false;
          uniq.add(p.id);
          if (seenIds.has(p.id)) return false;
          if (p.isReply || !p.text || p.text.trim().length < 20) return false;
          if (p.username && p.username.toLowerCase() === ownUsername) return false;
          if (p.username && cooledAuthors.has(p.username.toLowerCase())) return false;
          if (p.timestamp && Date.now() - new Date(p.timestamp).getTime() > REPLY_MAX_POST_AGE_MS) return false;
          return true;
        })
        // 有人回過的貼文(hasReplies)當熱度訊號優先
        .sort((a, b) => Number(b.hasReplies) - Number(a.hasReplies))
        .slice(0, REPLY_CANDIDATES_FOR_AI);
      if (!candidates.length) {
        console.log(`[replies] ${brand.slug} 過濾後沒有可回覆的候選貼文`);
        return;
      }

      // AI 一次完成:相關性評分 + 真人語氣回覆
      const voice = getBrandVoice(brand.slug);
      const agentId = await findBrandAgent(env, brand.id);
      const listText = candidates
        .map((p, i) => `${i}. @${p.username ?? '匿名'}:${p.text!.slice(0, 280)}`)
        .join('\n---\n');
      const selection = await chatCompleteJson<{ selections: ReplySelection[] }>(env, {
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: [
              `你是品牌「${brand.name}」的第一線人員,正在用個人身分逛 Threads、跟大家聊天。${voice.frontlinePersona}`,
              ANTI_AI_RULES,
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `以下是 Threads 上搜到的熱門貼文,挑「最多 ${REPLY_MAX_QUEUED_PER_ROUND} 則」你真的有話想說的來回覆(relevance 至少 ${REPLY_RELEVANCE_MIN} 才選,寧缺勿濫):`,
              listText,
              '',
              '回覆鐵則(違反任何一條就不要選那則):',
              '1. 像真人搭話:分享自己第一線的經驗、觀點或一個小故事,30-120 字。',
              '2. 絕對不放連結、不提優惠促銷、不推銷服務、不叫人私訊;可以自然透露你的職業身分。',
              '3. 不說教、不糾正對方;先同理再補充,或幽默接梗。',
              '4. 政治、宗教、災難、性別對立等爭議話題一律不回。',
              '',
              '回傳 JSON:{"selections":[{"index":清單編號,"relevance":0到1,"reason":"為什麼值得回(30字內)","reply":"回覆全文"}]}',
              '如果都不值得回,回傳 {"selections":[]}',
            ].join('\n'),
          },
        ],
      });

      const picked = (selection.selections ?? [])
        .filter((s) => candidates[s.index] && s.relevance >= REPLY_RELEVANCE_MIN && !replyTextIssue(s.reply))
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, REPLY_MAX_QUEUED_PER_ROUND);

      // 入庫:選中的存 pending;其餘評估過的存 skipped(避免下輪重複評估)
      const pickedIndexes = new Set(picked.map((s) => s.index));
      const insertedIds: string[] = [];
      for (const sel of picked) {
        const p = candidates[sel.index];
        const rows = await sql`
          INSERT INTO threads_reply_targets (
            brand_id, target_post_id, target_permalink, target_username, target_text, target_timestamp,
            source_keyword, relevance_score, relevance_reason, reply_text, status, generated_by_agent_id
          ) VALUES (
            ${brand.id}::uuid, ${p.id}, ${p.permalink}, ${p.username}, ${p.text}, ${p.timestamp},
            ${p.sourceKeyword}, ${Math.min(1, Math.max(0, sel.relevance))}, ${sel.reason},
            ${sel.reply.trim()}, 'pending', ${agentId}
          ) ON CONFLICT (brand_id, target_post_id) DO NOTHING
          RETURNING id
        `;
        if (rows.length) {
          const id = (rows[0] as { id: string }).id;
          insertedIds.push(id);
          await logActivity(env, {
            brandId: brand.id,
            actorType: 'ai_agent',
            actorAgentId: agentId,
            action: 'threads_reply.generated',
            entityType: 'threads_reply_target',
            entityId: id,
            afterState: { targetUsername: p.username, keyword: p.sourceKeyword, relevance: sel.relevance },
          });
        }
      }
      for (const [i, p] of candidates.entries()) {
        if (pickedIndexes.has(i)) continue;
        await sql`
          INSERT INTO threads_reply_targets (
            brand_id, target_post_id, target_permalink, target_username, target_text, target_timestamp,
            source_keyword, status
          ) VALUES (
            ${brand.id}::uuid, ${p.id}, ${p.permalink}, ${p.username}, ${p.text}, ${p.timestamp},
            ${p.sourceKeyword}, 'skipped'
          ) ON CONFLICT (brand_id, target_post_id) DO NOTHING
        `;
      }
      console.log(`[replies] ${brand.slug} 關鍵字=${keywords.join('、')} 候選=${candidates.length} 入庫=${insertedIds.length}`);

      // auto_reply 開啟時每輪自動發布 1 則(需未達上限、距上次回覆超過最小間隔)
      if (account.autoReply && insertedIds.length && !capReached) {
        const intervalOk = !state.last_replied_at ||
          Date.now() - new Date(state.last_replied_at).getTime() >= REPLY_MIN_INTERVAL_MS;
        if (intervalOk) {
          const result = await publishReplyTarget(env, { targetId: insertedIds[0], account });
          if (result.ok) console.log(`[replies] ${brand.slug} 已自動回覆:${result.replyPermalink ?? result.replyPostId}`);
          else console.error(`[replies] ${brand.slug} 自動回覆失敗:${result.error}`);
        }
      }
    } catch (e) {
      console.error(`[replies] 品牌 ${brand.slug} 回覆輪失敗`, e);
    }
    return; // 每輪只處理一個品牌
  }
}

// ============================================================================
// 主流程 2b:FB/IG 每日主題圖文(每天每品牌 1 篇,固定台灣 19:00 檔)
//   生成與發布拆開:這裡只生成 + 存 scheduled 排程,實際發布交給 publishDueJobs
//   (18:00 整點檔留給 Threads 發文輪,主題生成在 18:00 的 tick 觸發,提前 1 小時)
// ============================================================================
const DAILY_THEME_TARGET = 1;
const DAILY_THEME_SOURCE = 'daily_theme';

/** 回傳 true 表示這次已經做了主題生成(呼叫端可據此決定要不要跳過其他任務) */
async function generateDailyTheme(env: Env, slotAt: Date): Promise<boolean> {
  const sql = getSql(env);
  // 台灣今天已生成的主題數(以 daily_theme 內容的 themeKey 去重)
  // 同進度時,已接 FB/IG 且開自動發布的品牌優先 → 會真正發文的品牌固定在當天第一個生成 tick 發出
  const brands = await sql`
    SELECT b.id, b.slug, b.name,
           (SELECT count(DISTINCT c.generation_prompt_meta->>'themeKey')::int FROM contents c
            WHERE c.brand_id = b.id
              AND c.generation_prompt_meta->>'source' = ${DAILY_THEME_SOURCE}
              AND c.created_at > date_trunc('day', now() + interval '8 hours') - interval '8 hours') AS theme_count,
           EXISTS(SELECT 1 FROM brand_social_accounts a
                  WHERE a.brand_id = b.id AND a.platform IN ('facebook', 'instagram')
                    AND a.status = 'connected' AND a.auto_publish) AS can_publish
    FROM brands b WHERE b.is_active = true
    ORDER BY theme_count ASC, can_publish DESC
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

        // 帳號開啟排程自動發布 → 生成後存 scheduled 排程,由 publishDueJobs 在 slotAt 到時真正發布;否則存待審核
        const account = await getMetaAccount(env, brand.id, platform);
        const publicImage = toPublicMediaUrl(env, result.imageUrl);
        const willAutoPublish = !!account?.autoPublish && (platform !== 'instagram' || !!publicImage);

        const { contentId, versionId } = await saveGeneratedContent(env, {
          brandCtx, platform, result,
          generatedByAgentId: agentId,
          status: willAutoPublish ? 'scheduled' : 'pending_review',
          promptMeta: { source: DAILY_THEME_SOURCE, theme: theme.theme, themeKey, slotAt: slotAt.toISOString() },
        });

        if (willAutoPublish) {
          await sql`
            INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
            VALUES (${contentId}::uuid, ${versionId}::uuid, ${platform}, 'scheduled', ${slotAt.toISOString()}::timestamptz)
          `;
        }

        await logActivity(env, {
          brandId: brand.id,
          actorType: 'ai_agent',
          actorAgentId: agentId,
          action: 'content.generated',
          entityType: 'content',
          entityId: contentId,
          afterState: { platform, auto: true, dailyTheme: theme.theme, scheduled: willAutoPublish, slotAt: slotAt.toISOString() },
        });
        console.log(`[themes] ${brand.slug}/${platform} 已排定 ${slotAt.toISOString()} 發布(${willAutoPublish ? '自動' : '待審核'})`);
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
// 生成與發布拆開後的統一調度:
//   - 固定時段(台灣時間):Threads 品牌相關 00/06/12/18、Threads 生活哏文 09/21、FB+IG 每日主題 19
//   - 生成階段:每個時段提前 1 小時,在對應的整點 tick 生成內容並存成 scheduled 排程
//     (例如 06:00 檔在 05:00 的 tick 生成)→ 行程表可以提早看到「已排定、內容是什麼」
//   - 發布階段:每個 tick 都檢查有沒有到期的 scheduled 排程,到了時間才真正呼叫平台 API 發布
//     (由 publishDueJobs 負責;因為排程時段本身就避開凌晨 2-6 點,不需要額外的靜默判斷)
//   - Threads 熱門貼文回覆輪:凌晨 2-6 點靜默(避免被平台判定為機器人),其餘偶數小時的半點 tick 跑一次
// ============================================================================
const THREADS_POST_HOURS_TW = [0, 6, 12, 18];       // 品牌相關跟風文
const THREADS_OFFTOPIC_HOURS_TW = [9, 21];          // 生活哏文(見 generateThreadsOfftopicSlot)
const DAILY_THEME_HOUR_TW = 19;                     // FB/IG 每日主題
const GENERATION_LEAD_HOURS = 1;                    // 生成提前量:每個時段提前 1 小時生成

/** 計算「台灣時間 hourTW 點」下一次發生的時間點(已經過去就排到明天) */
function slotDateFor(hourTW: number): Date {
  const nowMs = Date.now();
  const twOffsetMs = 8 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  const twMidnightMs = Math.floor((nowMs + twOffsetMs) / dayMs) * dayMs;
  let slotUtcMs = twMidnightMs + hourTW * 60 * 60 * 1000 - twOffsetMs;
  if (slotUtcMs <= nowMs) slotUtcMs += dayMs;
  return new Date(slotUtcMs);
}

async function halfHourlyDispatch(env: Env): Promise<void> {
  const twHour = (new Date().getUTCHours() + 8) % 24;
  const minute = new Date().getUTCMinutes();
  const isTopOfHour = minute < 15 || minute >= 45;

  // 生成階段:提前 1 小時,在整點 tick 幫「下一個時段」把內容生成好存 scheduled
  if (isTopOfHour) {
    const genHour = (twHour + GENERATION_LEAD_HOURS) % 24;
    const slotAt = slotDateFor(genHour);
    if (THREADS_POST_HOURS_TW.includes(genHour)) await generateThreadsSlot(env, slotAt);
    if (THREADS_OFFTOPIC_HOURS_TW.includes(genHour)) await generateThreadsOfftopicSlot(env, slotAt);
    if (genHour === DAILY_THEME_HOUR_TW) await generateDailyTheme(env, slotAt);
  }

  // 發布階段:每個 tick 都檢查有沒有已經到期的排程要真正發出去(呼叫平台 API)
  await publishDueJobs(env);

  // Threads 回覆輪:凌晨 2-6 點靜默;其餘偶數小時的半點 tick 跑一次(分散平台請求)
  if (twHour >= 2 && twHour < 6) return;
  if (!isTopOfHour && twHour % 2 === 0) {
    await threadsReplyRound(env);
  }
}

// ============================================================================
// 統一發布 Worker:讀取 publishing_jobs 依 scheduled_at 執行(補上 docs/09-api-roadmap.md 早就規劃的缺口)
//   - 每個 tick 都跑一次,查詢已到期(scheduled_at <= now)且還是 scheduled 狀態的排程
//   - 依平台呼叫對應的 Graph API / Threads API,成功寫回 published_at + external_post_id、
//     失敗則標記 failed 並把錯誤訊息記到 publishing_logs(行程表會顯示這個原因)
// ============================================================================
async function publishDueJobs(env: Env): Promise<void> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT pj.id AS job_id, pj.content_id, pj.content_version_id, pj.platform,
           c.brand_id, b.slug AS brand_slug,
           cv.body, cv.hashtags,
           a.file_url AS image_url
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    JOIN brands b ON b.id = c.brand_id
    LEFT JOIN content_versions cv ON cv.id = pj.content_version_id
    LEFT JOIN LATERAL (
      SELECT file_url FROM content_assets WHERE content_version_id = cv.id AND asset_type = 'image' LIMIT 1
    ) a ON true
    WHERE pj.status = 'scheduled' AND pj.scheduled_at <= now()
    ORDER BY pj.scheduled_at ASC
    LIMIT 10
  `;
  if (!rows.length) return;

  for (const row of rows as {
    job_id: string; content_id: string; content_version_id: string; platform: SocialPlatform;
    brand_id: string; brand_slug: string; body: string | null; hashtags: string[] | null; image_url: string | null;
  }[]) {
    try {
      await sql`UPDATE publishing_jobs SET status = 'publishing' WHERE id = ${row.job_id}::uuid`;
      if (!row.body) throw new Error('內容缺少貼文全文(content_versions.body 為空)');

      let published: { postId: string; permalink: string | null };
      if (row.platform === 'threads') {
        const account = await getThreadsAccount(env, row.brand_id);
        if (!account) throw new Error('Threads 帳號未連線或憑證失效');
        published = await publishThreadsPost(account, { text: row.body, imageUrl: toPublicMediaUrl(env, row.image_url) });
      } else if (row.platform === 'facebook') {
        const account = await getMetaAccount(env, row.brand_id, 'facebook');
        if (!account) throw new Error('Facebook 帳號未連線或憑證失效');
        const message = composePostMessage(row.body, row.hashtags);
        published = await publishFacebookPost(account, { message, imageUrl: toPublicMediaUrl(env, row.image_url) });
      } else if (row.platform === 'instagram') {
        const account = await getMetaAccount(env, row.brand_id, 'instagram');
        const publicImage = toPublicMediaUrl(env, row.image_url);
        if (!account) throw new Error('Instagram 帳號未連線或憑證失效');
        if (!publicImage) throw new Error('Instagram 發文需要配圖,但這篇內容沒有圖片');
        const message = composePostMessage(row.body, row.hashtags);
        published = await publishInstagramPost(account, { caption: message, imageUrl: publicImage });
      } else {
        throw new Error(`不支援自動發布的平台:${row.platform}`);
      }

      await sql`
        UPDATE publishing_jobs SET status = 'published', published_at = now(),
          external_post_id = ${published.permalink ?? published.postId}
        WHERE id = ${row.job_id}::uuid
      `;
      await sql`UPDATE contents SET status = 'published', updated_at = now() WHERE id = ${row.content_id}::uuid`;
      await sql`
        INSERT INTO publishing_logs (publishing_job_id, event, detail)
        VALUES (${row.job_id}::uuid, 'published', ${published.permalink ?? published.postId})
      `;
      console.log(`[publish] ${row.brand_slug}/${row.platform} 已發布:${published.permalink ?? published.postId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sql`UPDATE publishing_jobs SET status = 'failed' WHERE id = ${row.job_id}::uuid`;
      await sql`
        INSERT INTO publishing_logs (publishing_job_id, event, detail)
        VALUES (${row.job_id}::uuid, 'failed', ${msg.slice(0, 500)})
      `;
      console.error(`[publish] ${row.brand_slug}/${row.platform} 發布失敗`, e);
    }
  }
}

// ============================================================================
// 主流程 4:Threads 長效 token 自動續期
//   Threads 長效 token 效期 60 天,且必須「已存在超過 24 小時」才能續期;
//   續期本身只需帶著現有 token 呼叫 th_refresh_token,不需要 App Secret。
//   策略:token_expires_at 距今 < 10 天,或完全未知(NULL,且已建立超過 24 小時)→ 嘗試續期。
// ============================================================================
const THREADS_API = 'https://graph.threads.net/v1.0';

async function refreshThreadsTokens(env: Env): Promise<void> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id, a.access_token_enc, b.slug
    FROM brand_social_accounts a
    JOIN brands b ON b.id = a.brand_id
    WHERE a.platform = 'threads' AND a.access_token_enc IS NOT NULL
      AND (
        a.token_expires_at IS NULL
        OR a.token_expires_at < now() + interval '10 days'
      )
      AND a.updated_at < now() - interval '24 hours'
  `;
  for (const row of rows as { id: string; access_token_enc: string; slug: string }[]) {
    try {
      const token = await decryptToken(env, row.access_token_enc);
      const res = await fetch(`${THREADS_API}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[token-refresh] ${row.slug} threads 續期失敗 (${res.status}): ${text.slice(0, 200)}`);
        await sql`UPDATE brand_social_accounts SET status = 'error', notes = ${'token 續期失敗,請重新產生長效 token: ' + text.slice(0, 200)}, updated_at = now() WHERE id = ${row.id}::uuid`;
        continue;
      }
      const data = await res.json() as { access_token: string; expires_in: number };
      const enc = await encryptToken(env, data.access_token);
      await sql`
        UPDATE brand_social_accounts
        SET access_token_enc = ${enc}, token_expires_at = now() + (${data.expires_in} || ' seconds')::interval,
            status = 'connected', notes = NULL, updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      console.log(`[token-refresh] ${row.slug} threads token 已續期,效期 ${(data.expires_in / 86400).toFixed(1)} 天`);
    } catch (e) {
      console.error(`[token-refresh] ${row.slug} 處理失敗`, e);
    }
  }
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
        ctx.waitUntil(refreshThreadsTokens(env).catch((e) => console.error('[token-refresh] 整輪失敗', e)));
        break;
      case '0 23 * * 1,4':
        // 台灣週二、五早上 7 點:生成 Podcast 逐字稿(語音合成由人工在後台觸發,控 ElevenLabs 用量)
        ctx.waitUntil(createPodcastEpisode(env).catch((e) => console.error('[podcast] 生成節目失敗', e)));
        break;
      default:
        ctx.waitUntil(collectSignals(env));
    }
  },

  // 手動觸發除錯用:GET /?task=collect|drafts|threads|offtopic|replies|themes|publish|cleanup|podcast|refresh-tokens(需帶 secret)
  // threads/offtopic/themes 可帶 &slotAt=ISO時間 指定要排定發布的時段(預設現在,方便測試)
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const task = url.searchParams.get('task');
    const secret = url.searchParams.get('secret');
    if (!secret || secret !== (env.SESSION_SECRET ?? env.ADMIN_PASSWORD)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const slotAt = new Date(url.searchParams.get('slotAt') ?? Date.now());
    if (task === 'collect') await collectSignals(env);
    else if (task === 'drafts') await generateSignalDrafts(env);
    else if (task === 'threads') await generateThreadsSlot(env, slotAt);
    else if (task === 'offtopic') await generateThreadsOfftopicSlot(env, slotAt);
    else if (task === 'replies') await threadsReplyRound(env);
    else if (task === 'themes') await generateDailyTheme(env, slotAt);
    else if (task === 'publish') await publishDueJobs(env);
    else if (task === 'cleanup') await cleanupOldMedia(env);
    else if (task === 'refresh-tokens') await refreshThreadsTokens(env);
    else if (task === 'podcast') {
      const result = await createPodcastEpisode(env);
      return new Response(JSON.stringify({ ok: true, task, result }), { headers: { 'Content-Type': 'application/json' } });
    }
    else return new Response('task 必須為 collect / drafts / threads / offtopic / replies / themes / publish / cleanup / podcast / refresh-tokens', { status: 400 });
    return new Response(JSON.stringify({ ok: true, task }), { headers: { 'Content-Type': 'application/json' } });
  },
};
