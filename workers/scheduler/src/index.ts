import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from '../../../functions/_shared/env';
import { getSql } from '../../../functions/_shared/db';
import { chatCompleteJson } from '../../../functions/_shared/openai';
import {
  buildBrandContext, getBrandVoice, ANTI_AI_RULES,
  THREADS_HOURLY_CATEGORIES, pickThreadsHourlyCategory, type ThreadsHourlyCategoryId,
  buildCollaborationContext, findEcosystemCollaborationId, pickEcosystemXAngle,
  pickAudience, audienceLaneInstruction,
} from '../../../functions/_shared/prompts';
import {
  generatePlatformPost, generateOfftopicPost, generateThreadsFromImage,
  saveGeneratedContent, findBrandAgent, type SocialPlatform,
  generateEcosystemXPost, saveEcosystemXContent, findEcosystemAgent,
  pickBrandScreenshot, SPOTLIGHT_SLUG,
} from '../../../functions/_shared/generate';
import { getThreadsAccount, publishThreadsPost, searchThreadsPosts, isThreadsAccessBlocked, THREADS_ACCESS_BLOCKED_NOTE, type ThreadsSearchPost } from '../../../functions/_shared/threads';
import { getMetaAccount, publishFacebookPost, publishInstagramPost, publishInstagramReel, composePostMessage, isMetaTokenInvalid, META_TOKEN_INVALID_NOTE } from '../../../functions/_shared/meta';
import { getXAccount, publishTweet, publishTweetThread, refreshXToken } from '../../../functions/_shared/x';
import { toPublicMediaUrl } from '../../../functions/_shared/media';
import { publishReplyTarget, replyTextIssue } from '../../../functions/_shared/threads-replies';
import { encryptToken, decryptToken } from '../../../functions/_shared/crypto';
import { logActivity } from '../../../functions/_shared/activity';
import { fetchGoogleTrendsTW, fetchGoogleNews, fetchTaiwanNews, fetchPttBoard, fetchDcard, type TrendItem } from '../../../functions/_shared/sources';
import { createPodcastEpisode } from '../../../functions/_shared/podcast';
import { slugifyStoryKey } from '../../../functions/_shared/press';
import { syncPerformanceInsights } from '../../../functions/_shared/insights';
import { analyzeAllBrandPerformance } from '../../../functions/_shared/performance-learn';

// 每品牌的議題來源設定;filterKeywords 用於從一般新聞中挑出行業相關文章
const BRAND_SOURCES: Record<string, {
  newsQuery: string;
  filterKeywords: string[];
  brandQueries: string[];
  brandNames: string[];
  pttBoard?: string;
  dcardForum?: string;
}> = {
  homigo: {
    newsQuery: '租屋 OR 租金補貼 OR 包租代管 OR 房東 房客',
    filterKeywords: ['租屋', '租金', '房東', '房客', '租客', '包租', '社宅', '房市', '押金', '租約', '囤房'],
    brandQueries: ['Homigo', '匠管 Homigo', 'Inforcraft 租屋'],
    brandNames: ['Homigo', '匠管', 'Inforcraft'],
    pttBoard: 'home-sale', dcardForum: 'rent',
  },
  taskgo: {
    newsQuery: '裝修 OR 室內裝潢 OR 工班 OR 老屋翻新',
    filterKeywords: ['裝修', '裝潢', '工班', '翻新', '缺工', '工地', '建材', '室內設計', '水電', '漏水'],
    brandQueries: ['TaskGo', 'Task Go', '匠管 Task'],
    brandNames: ['TaskGo', 'Task Go', '匠管'],
    pttBoard: 'Interior', dcardForum: 'interior_design',
  },
  washgo: {
    newsQuery: '洗衣店 OR 乾洗 OR 衣物保養 OR 換季收納',
    filterKeywords: ['洗衣', '乾洗', '衣物', '棉被', '羽絨', '換季', '收納', '梅雨', '潮濕', '黴'],
    brandQueries: ['Washgo', 'WashGo', '匠管 洗衣'],
    brandNames: ['Washgo', 'WashGo'],
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
      const config = BRAND_SOURCES[brand.slug] ?? { newsQuery: brand.name, filterKeywords: [], brandQueries: [brand.name], brandNames: [brand.name] };
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
// 品牌名監測:Google News + 台灣媒體 RSS → press_coverages.inbox
//   不自動核准、不自動發文。Google News 503 時仍可靠台灣 RSS。
// ============================================================================
async function collectPressMentions(env: Env): Promise<void> {
  const sql = getSql(env);
  const brands = await sql`SELECT id, slug, name FROM brands WHERE is_active = true`;
  const generalNews = await fetchTaiwanNews();
  const analystId = await findMarketAnalystAgent(env);

  for (const brand of brands as { id: string; slug: string; name: string }[]) {
    try {
      const config = BRAND_SOURCES[brand.slug] ?? {
        newsQuery: brand.name, filterKeywords: [], brandQueries: [brand.name], brandNames: [brand.name],
      };
      const gnews = (await Promise.all(config.brandQueries.map((q) => fetchGoogleNews(q, 6)))).flat();
      const nameHits = generalNews.filter((n) =>
        config.brandNames.some((name) => (n.title + (n.snippet ?? '')).includes(name)),
      );
      const seen = new Set<string>();
      const candidates = [...gnews, ...nameHits].filter((c) => {
        const key = (c.url || c.title).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 20);
      if (!candidates.length) continue;

      const existing = await sql`
        SELECT article_url, headline FROM press_coverages WHERE brand_id = ${brand.id}::uuid
      `;
      const existingUrls = new Set((existing as { article_url: string | null }[]).map((r) => r.article_url).filter(Boolean));
      const existingTitles = new Set((existing as { headline: string }[]).map((r) => r.headline));
      const fresh = candidates.filter((c) => {
        if (c.url && existingUrls.has(c.url)) return false;
        if (existingTitles.has(c.title)) return false;
        return true;
      });
      if (!fresh.length) continue;

      const listText = fresh.map((c, i) => `${i}. ${c.title}${c.snippet ? ` — ${c.snippet.slice(0, 120)}` : ''}`).join('\n');
      const classified = await chatCompleteJson<{ items: { index: number; kind: string; outlet: string; summary: string }[] }>(env, {
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `你在幫品牌「${brand.name}」分辨新聞。own_coverage=這則是在報導或點名本品牌/產品;industry_news=產業新聞但沒有報導本品牌;noise=無關。`,
          },
          {
            role: 'user',
            content: [
              `品牌名/產品名:${config.brandNames.join('、')}`,
              listText,
              '回傳 JSON:{"items":[{"index":編號,"kind":"own_coverage|industry_news|noise","outlet":"媒體名(不知道就寫來源網站)","summary":"40字內摘要,不可抄全文"}]}',
            ].join('\n'),
          },
        ],
      });

      for (const item of classified.items ?? []) {
        if (item.kind !== 'own_coverage') continue;
        const src = fresh[item.index];
        if (!src) continue;
        try {
          await sql`
            INSERT INTO press_coverages (
              brand_id, story_key, outlet, headline, article_url, published_on,
              status, discovery_source, summary, key_quotes, claimable_facts, is_primary
            ) VALUES (
              ${brand.id}::uuid,
              ${slugifyStoryKey(`${brand.slug}-${src.title}`)},
              ${item.outlet || '未標示媒體'},
              ${src.title},
              ${src.url ?? null},
              ${new Date().toISOString().slice(0, 10)},
              'inbox',
              'scheduler',
              ${item.summary || null},
              ${JSON.stringify([])},
              ${JSON.stringify([])},
              true
            )
          `;
          await logActivity(env, {
            brandId: brand.id,
            actorType: 'ai_agent',
            actorAgentId: analystId,
            action: 'press_coverage.created',
            entityType: 'press_coverage',
            afterState: { headline: src.title, source: 'scheduler' },
          });
        } catch (e) {
          console.log(`[press] ${brand.slug} 略過重複或寫入失敗`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      console.error(`[press] 品牌 ${brand.slug} 監測失敗`, e);
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
        promptMeta: { source: 'auto_signal', signalId: signal.id, audienceLane: result.audienceLane, audienceName: result.audienceName },
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
//   - 每次處理最多 3 個品牌;已連 Threads 且開自動發布的品牌(會真正發文)優先
//   - 熱門議題來源:Google Trends TW + 近期自抓的社群情報(PTT/Dcard)
//   - 生成與發布拆開:這裡只生成內容 + 存 scheduled 排程,實際發布交給 publishDueJobs
//     在 scheduled_at(=slotAt,即這篇該發布的時段)到了之後才真正呼叫平台 API
// ============================================================================
const THREADS_DAILY_CAP = 4; // 每品牌每日上限(以排定時段所在的台灣時區當天計)
const THREADS_BRANDS_PER_TICK = 3; // Homigo / TaskGo / Washgo 同一檔都產,不再互搶
const THREADS_MIN_INTERVAL_MS = 5 * 60 * 60 * 1000; // 每品牌至少間隔 5 小時 → 配合 6 小時一檔

async function generateThreadsSlot(
  env: Env,
  slotAt: Date,
  opts?: { slugs?: string[]; ignoreInterval?: boolean; onlyMissing?: boolean },
): Promise<void> {
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
    LIMIT ${opts?.slugs?.length ? 20 : THREADS_BRANDS_PER_TICK}
  `;
  const selected = (brands as {
    id: string; slug: string; name: string; last_at: string | null; today_count: number;
    recent_categories: (string | null)[] | null;
  }[]).filter((b) => !opts?.slugs?.length || opts.slugs.includes(b.slug));

  for (const brand of selected) {
    if (opts?.onlyMissing && await brandHasSlotJob(env, brand.id, 'threads', 'threads_hourly', slotAt)) {
      console.log(`[catchup] ${brand.slug} ${slotAt.toISOString()} Threads 跟風檔已存在,跳過`);
      continue;
    }
    if (brand.today_count >= THREADS_DAILY_CAP) continue;
    if (!opts?.ignoreInterval && brand.last_at && Date.now() - new Date(brand.last_at).getTime() < THREADS_MIN_INTERVAL_MS) continue;
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
          assetId: candidateImage.id,
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
          audienceLane: 'b2c',
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
          slotAt: slotAt.toISOString(),
          audienceLane: 'b2c',
          audienceName: result.audienceName,
          assetId: category.id === 'image_inspired' && candidateImage ? candidateImage.id : undefined,
        },
        imageAssetMeta: category.id === 'image_inspired' && candidateImage
          ? { sourceAssetId: candidateImage.id, generated: false, reused: true }
          : undefined,
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
//   - Washgo + TaskGo(OFFTOPIC_BRANDS),跟品牌無關的生活哏文衝帳號真實感
//   - 固定 2 檔:台灣 09:00 / 21:00,不佔用/不影響品牌相關貼文的 THREADS_DAILY_CAP
//   - 完全不套用品牌語氣與知識庫,純文字、不配圖,見 functions/_shared/prompts.ts 的 OFFTOPIC_SYSTEM_PROMPT
// ============================================================================
const OFFTOPIC_BRANDS = ['washgo', 'taskgo'];
const THREADS_OFFTOPIC_DAILY_CAP = 2;

async function generateThreadsOfftopicSlot(
  env: Env,
  slotAt: Date,
  opts?: { slugs?: string[]; onlyMissing?: boolean },
): Promise<void> {
  const sql = getSql(env);
  const targetSlugs = opts?.slugs?.length ? opts.slugs.filter((s) => OFFTOPIC_BRANDS.includes(s)) : OFFTOPIC_BRANDS;
  for (const slug of targetSlugs) {
    try {
      const brandRows = await sql`SELECT id, slug, name FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1`;
      if (!brandRows.length) continue;
      const brand = brandRows[0] as { id: string; slug: string; name: string };
      if (opts?.onlyMissing && await brandHasSlotJob(env, brand.id, 'threads', 'threads_offtopic', slotAt)) {
        console.log(`[catchup] ${brand.slug} ${slotAt.toISOString()} Threads 生活哏文已存在,跳過`);
        continue;
      }

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
        promptMeta: { source: 'threads_offtopic', slotAt: slotAt.toISOString(), audienceLane: 'b2c' },
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

const CATCHUP_BRANDS = ['taskgo', 'washgo'] as const;

function taiwanDayStartUtc(now = new Date()): Date {
  const twMs = now.getTime() + 8 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  return new Date(Math.floor(twMs / dayMs) * dayMs - 8 * 60 * 60 * 1000);
}

function slotAtToday(hourTW: number, now = new Date()): Date {
  return new Date(taiwanDayStartUtc(now).getTime() + hourTW * 60 * 60 * 1000);
}

async function brandHasSlotJob(
  env: Env,
  brandId: string,
  platform: string,
  source: string,
  slotAt: Date,
  windowMin = 90,
): Promise<boolean> {
  const sql = getSql(env);
  const from = new Date(slotAt.getTime() - windowMin * 60 * 1000).toISOString();
  const to = new Date(slotAt.getTime() + windowMin * 60 * 1000).toISOString();
  const rows = await sql`
    SELECT pj.id FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    WHERE c.brand_id = ${brandId}::uuid
      AND pj.platform = ${platform}
      AND c.generation_prompt_meta->>'source' = ${source}
      AND coalesce((c.generation_prompt_meta->>'slotAt')::timestamptz, pj.scheduled_at)
          BETWEEN ${from}::timestamptz AND ${to}::timestamptz
    LIMIT 1
  `;
  return rows.length > 0;
}

/** 補今天已過、且最接近現在的缺檔 Threads(一次最多 1 個跟風 + 1 個哏文,避免 Worker 逾時) */
async function catchupMissingThreadsSlots(env: Env, slugs: string[]): Promise<void> {
  const sql = getSql(env);
  const now = new Date();
  const twHour = (now.getUTCHours() + 8) % 24;
  const brands = await sql`SELECT id, slug FROM brands WHERE slug IN ('taskgo', 'washgo') AND is_active = true`;
  const brandRows = (brands as { id: string; slug: string }[]).filter((b) => slugs.includes(b.slug));

  let hourlyDone = false;
  let offtopicDone = false;
  for (const hour of THREADS_POST_HOURS_TW.filter((h) => h <= twHour).reverse()) {
    if (hourlyDone) break;
    const slot = slotAtToday(hour, now);
    for (const brand of brandRows) {
      if (await brandHasSlotJob(env, brand.id, 'threads', 'threads_hourly', slot)) continue;
      console.log(`[catchup] 補 ${brand.slug} Threads 跟風 ${hour}:00`);
      await generateThreadsSlot(env, slot, { slugs: [brand.slug], ignoreInterval: true, onlyMissing: true });
      hourlyDone = true;
      break;
    }
  }
  for (const hour of THREADS_OFFTOPIC_HOURS_TW.filter((h) => h <= twHour).reverse()) {
    if (offtopicDone) break;
    const slot = slotAtToday(hour, now);
    for (const brand of brandRows) {
      if (await brandHasSlotJob(env, brand.id, 'threads', 'threads_offtopic', slot)) continue;
      console.log(`[catchup] 補 ${brand.slug} Threads 生活哏文 ${hour}:00`);
      await generateThreadsOfftopicSlot(env, slot, { slugs: [brand.slug], onlyMissing: true });
      offtopicDone = true;
      break;
    }
  }
}

/** 手動補發:TaskGo / Washgo 今天已過、但還沒產出或還沒發出的自動檔 */
async function catchupTodayAutoPosts(env: Env): Promise<void> {
  const slugs = [...CATCHUP_BRANDS];
  console.log(`[catchup] 開始補齊 ${slugs.join(' / ')} 今日自動發文`);
  await recoverStuckPublishingJobs(env);
  await ensureDailyThemePublishJobs(env, slugs);
  await publishDueJobs(env);
  await fillMissingDailyThemePlatforms(env, slotAtToday(DAILY_THEME_HOUR_TW), slugs);
  await catchupMissingThreadsSlots(env, slugs);
  await publishDueJobs(env);
  console.log('[catchup] 補齊與發布輪結束');
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
//   已接 FB/IG 的品牌同一輪各產 1 則(Washgo / TaskGo 不會互搶名額)
//   生成與發布拆開:這裡只生成 + 存 scheduled 排程,實際發布交給 publishDueJobs
//   (18:00 整點檔留給 Threads 發文輪,主題生成在 18:00 的 tick 觸發,提前 1 小時)
// ============================================================================
const DAILY_THEME_TARGET = 1;
const DAILY_THEME_SOURCE = 'daily_theme';

type DailyThemeBrand = { id: string; slug: string; name: string; theme_count: number };

/** 回傳 true 表示這次已經做了主題生成(呼叫端可據此決定要不要跳過其他任務) */
async function generateDailyTheme(env: Env, slotAt: Date): Promise<boolean> {
  const sql = getSql(env);
  // 台灣今天已生成的主題數(以 daily_theme 內容的 themeKey 去重)
  // 只處理已接 FB 或 IG 的品牌;沒接的(例如 Homigo)不佔用生成額度
  let brands;
  try {
    brands = await sql`
      SELECT b.id, b.slug, b.name,
             (SELECT count(DISTINCT c.generation_prompt_meta->>'themeKey')::int FROM contents c
              WHERE c.brand_id = b.id
                AND c.generation_prompt_meta->>'source' = ${DAILY_THEME_SOURCE}
                AND c.created_at > date_trunc('day', now() + interval '8 hours') - interval '8 hours') AS theme_count
      FROM brands b
      WHERE b.is_active = true
        AND EXISTS (
          SELECT 1 FROM brand_social_accounts a
          WHERE a.brand_id = b.id
            AND a.platform IN ('facebook', 'instagram')
            AND a.status = 'connected'
        )
      ORDER BY b.slug
    `;
  } catch (e) {
    // 這裡若失敗(例如資料庫連線暫時性問題)不能讓例外往上拋,
    // 否則會中斷同一輪 halfHourlyDispatch 後面的 publishDueJobs / 回覆輪等其他任務
    console.error('[themes] 品牌篩選查詢失敗', e);
    return false;
  }
  const due = (brands as DailyThemeBrand[]).filter((b) => b.theme_count < DAILY_THEME_TARGET);
  if (!due.length) return false;

  let any = false;
  for (const brand of due) {
    const ok = await generateDailyThemeForBrand(env, brand, slotAt);
    if (ok) any = true;
  }
  return any;
}

async function generateDailyThemePlatforms(
  env: Env,
  brand: DailyThemeBrand,
  slotAt: Date,
  platforms: Array<'facebook' | 'instagram'>,
  theme: { theme: string; angle: string; summary: string; themeKey: string },
): Promise<void> {
  const sql = getSql(env);
  const brandCtx = await buildBrandContext(env, brand.id);
  const agentId = await findBrandAgent(env, brand.id);
  const audience = await pickAudience(env, brand.id, brand.slug, 'b2b');

  for (const platform of platforms) {
    try {
      const result = await generatePlatformPost(env, {
        brandCtx, platform,
        topic: theme.theme,
        topicSummary: theme.summary,
          extraInstruction: platform === 'instagram'
            ? `切入角度:${theme.angle}。這是今天的每日主題貼文。IG:第一句=顧客搜得到的痛點,整篇只打一個標籤主題。配圖做成痛點海報(現場煩惱+主標+系統重點卡),不要整頁截圖直發。文案結尾要有明確匠管 CTA。主受眾:${audience.name}。`
            : `切入角度:${theme.angle}。這是今天的每日主題貼文,FB 與 IG 共用主題但要用各自平台的表達方式。配圖做成痛點海報,系統畫面當解法卡。主受眾:${audience.name}。`,
        audienceLane: 'b2b',
        audienceName: audience.name,
      });

      const account = await getMetaAccount(env, brand.id, platform);
      const publicImage = toPublicMediaUrl(env, result.imageUrl);
      const willAutoPublish = !!account?.autoPublish && (platform !== 'instagram' || !!publicImage);

      const { contentId, versionId } = await saveGeneratedContent(env, {
        brandCtx, platform, result,
        generatedByAgentId: agentId,
        status: willAutoPublish ? 'scheduled' : 'pending_review',
        promptMeta: {
          source: DAILY_THEME_SOURCE, theme: theme.theme, themeKey: theme.themeKey, slotAt: slotAt.toISOString(),
          audienceLane: 'b2b', audienceName: audience.name,
        },
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
}

/** 卡住的 publishing(Worker 逾時)重設回 scheduled,讓下一輪能再發 */
async function recoverStuckPublishingJobs(env: Env): Promise<number> {
  const sql = getSql(env);
  const rows = await sql`
    UPDATE publishing_jobs SET status = 'scheduled', updated_at = now()
    WHERE status = 'publishing' AND updated_at < now() - interval '2 minutes'
    RETURNING id, platform
  `;
  for (const row of rows as { id: string; platform: string }[]) {
    await sql`
      INSERT INTO publishing_logs (publishing_job_id, event, detail)
      VALUES (${row.id}::uuid, 'retried', '發布逾時,系統重設後再發')
    `;
    console.log(`[catchup] 已重設卡住的 ${row.platform} job ${row.id}`);
  }
  return rows.length;
}

/** 今日每日主題已有內容但沒有 publishing_job(常見於 IG 當時沒配圖)→ 補圖並建單 */
async function ensureDailyThemePublishJobs(env: Env, slugs: string[]): Promise<void> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT c.id, c.brand_id, b.slug, c.target_platform AS platform,
           c.generation_prompt_meta->>'themeKey' AS theme_key,
           c.generation_prompt_meta->>'slotAt' AS slot_at,
           v.id AS version_id,
           a.file_url AS image_url
    FROM contents c
    JOIN brands b ON b.id = c.brand_id
    JOIN content_versions v ON v.content_id = c.id
      AND v.version_number = (SELECT max(version_number) FROM content_versions WHERE content_id = c.id)
    LEFT JOIN LATERAL (
      SELECT file_url FROM content_assets
      WHERE content_version_id = v.id AND asset_type = 'image' LIMIT 1
    ) a ON true
    WHERE b.slug IN ('taskgo', 'washgo')
      AND c.generation_prompt_meta->>'source' = ${DAILY_THEME_SOURCE}
      AND c.created_at > date_trunc('day', now() + interval '8 hours') - interval '8 hours'
      AND NOT EXISTS (SELECT 1 FROM publishing_jobs pj WHERE pj.content_id = c.id)
  `;

  for (const row of rows as {
    id: string; brand_id: string; slug: string; platform: string;
    theme_key: string | null; slot_at: string | null; version_id: string; image_url: string | null;
  }[]) {
    if (!slugs.includes(row.slug)) continue;
    let imageUrl = row.image_url;
    if (!imageUrl && row.theme_key) {
      const sibling = await sql`
        SELECT a.file_url FROM contents c
        JOIN content_versions v ON v.content_id = c.id
        JOIN content_assets a ON a.content_version_id = v.id AND a.asset_type = 'image'
        WHERE c.brand_id = ${row.brand_id}::uuid
          AND c.generation_prompt_meta->>'themeKey' = ${row.theme_key}
          AND a.file_url IS NOT NULL
        ORDER BY c.created_at ASC
        LIMIT 1
      `;
      imageUrl = (sibling[0] as { file_url: string } | undefined)?.file_url ?? null;
      if (imageUrl) {
        await sql`
          INSERT INTO content_assets (content_version_id, asset_type, file_url, metadata)
          VALUES (${row.version_id}::uuid, 'image', ${imageUrl}, ${JSON.stringify({ reusedFromSibling: true })})
        `;
        console.log(`[catchup] ${row.slug}/${row.platform} 補上同主題配圖`);
      }
    }
    if (row.platform === 'instagram' && !imageUrl) {
      console.log(`[catchup] ${row.slug} IG 仍無配圖,略過建單`);
      continue;
    }
    const slotAt = row.slot_at ?? new Date().toISOString();
    await sql`
      INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
      VALUES (${row.id}::uuid, ${row.version_id}::uuid, ${row.platform}, 'scheduled', ${slotAt}::timestamptz)
    `;
    await sql`UPDATE contents SET status = 'scheduled', updated_at = now() WHERE id = ${row.id}::uuid`;
    console.log(`[catchup] ${row.slug}/${row.platform} 已補發布單`);
  }
}

/** 只補今天缺的 FB/IG 每日主題平台(已有主題的品牌沿用同一則,避免 TaskGo 有 FB 沒 IG 時被 theme_count 擋住) */
async function fillMissingDailyThemePlatforms(env: Env, slotAt: Date, slugs: string[]): Promise<void> {
  const sql = getSql(env);
  for (const slug of slugs) {
    const brandRows = await sql`SELECT id, slug, name FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1`;
    if (!brandRows.length) continue;
    const brand = brandRows[0] as DailyThemeBrand;
    brand.theme_count = 0;

    const existing = await sql`
      SELECT c.target_platform AS platform,
             c.generation_prompt_meta->>'theme' AS theme,
             c.generation_prompt_meta->>'themeKey' AS theme_key
      FROM contents c
      WHERE c.brand_id = ${brand.id}::uuid
        AND c.generation_prompt_meta->>'source' = ${DAILY_THEME_SOURCE}
        AND c.created_at > date_trunc('day', now() + interval '8 hours') - interval '8 hours'
        AND (
          EXISTS (SELECT 1 FROM publishing_jobs pj WHERE pj.content_id = c.id)
          OR c.target_platform <> 'instagram'
        )
    `;
    const have = new Set((existing as { platform: string }[]).map((r) => r.platform));
    const missing = (['facebook', 'instagram'] as const).filter((p) => !have.has(p));
    if (!missing.length) {
      console.log(`[catchup] ${slug} 今日 FB/IG 主題已齊`);
      continue;
    }

    const reused = (existing as { theme: string | null; theme_key: string | null }[]).find((r) => r.theme);
    if (reused?.theme) {
      console.log(`[catchup] ${slug} 補 ${missing.join('+')} 每日主題(沿用「${reused.theme}」)`);
      await generateDailyThemePlatforms(env, brand, slotAt, [...missing], {
        theme: reused.theme,
        angle: '',
        summary: reused.theme,
        themeKey: reused.theme_key ?? `${new Date().toISOString().slice(0, 10)}-${slug}-1`,
      });
    } else {
      console.log(`[catchup] ${slug} 今日尚無每日主題,整組生成`);
      await generateDailyThemeForBrand(env, brand, slotAt);
    }
  }
}

async function generateDailyThemeForBrand(env: Env, brand: DailyThemeBrand, slotAt: Date): Promise<boolean> {
  const sql = getSql(env);
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
    const audience = await pickAudience(env, brand.id, brand.slug, 'b2b');

    const theme = await chatCompleteJson<{ theme: string; angle: string; summary: string }>(env, {
      temperature: 0.6,
      messages: [
        { role: 'system', content: `你是品牌「${brand.name}」的內容企劃。今天的 FB/IG 圖文只寫給業者/SaaS 買家,不是一般消費者。${audienceLaneInstruction(brand.slug, 'b2b')}` },
        {
          role: 'user',
          content: [
            '請從以下近期情報歸納出「一個」今天最值得做 FB+IG 圖文的主題。',
            '這篇是寫給業者的:手寫單、派工、對帳、多門市、客源、系統操作。不要出換季、媽媽加班、羽絨被這類 C 端生活題。',
            `主受眾:${audience.name}。痛點:${JSON.stringify(audience.painPoints)}。訴求:${audience.appealAngle ?? ''}`,
            signalText || '(目前沒有新情報,請從業者日常痛點自選一個)',
            usedThemes.length ? `今天已做過的主題(不要重複):${usedThemes.join('、')}` : '',
            `業者每天在煩的事:${voice.operatorConcerns ?? voice.dailyConcerns}`,
            '',
            '回傳 JSON:{"theme":"主題標題","angle":"切入角度一句話","summary":"主題背景說明(100字內)"}',
          ].filter(Boolean).join('\n'),
        },
      ],
    });

    const themeKey = `${new Date().toISOString().slice(0, 10)}-${brand.slug}-${brand.theme_count + 1}`;
    await generateDailyThemePlatforms(env, brand, slotAt, ['facebook', 'instagram'], {
      theme: theme.theme, angle: theme.angle, summary: theme.summary, themeKey,
    });
    console.log(`[themes] ${brand.slug} 今日主題 #${brand.theme_count + 1}:${theme.theme}`);
    return true;
  } catch (e) {
    console.error(`[themes] 品牌 ${brand.slug} 主題生成失敗`, e);
    return false;
  }
}

// ============================================================================
// 主流程 2e:Go 生態系跨品牌導流貼文(Homigo 房東 TA 看見 TaskGo 修繕/Washgo 洗衣等)
//   - 每週固定 2 檔(週三/週日 台灣 20:00),三品牌輪流:每次挑「近 7 天內做過生態系導流
//     貼文次數最少」的品牌,確保三品牌長期均勻輪替,而不是每次都同一個品牌
//   - 內容素材只能來自 Go 生態系 Collaboration Brief(見 prompts.ts 的
//     buildCollaborationContext),不得跨讀對方完整 Brand Knowledge(Principle 3)
//   - 平台與角度依品牌各自設定(ECOSYSTEM_ANGLES),沿用該品牌自己的 FB/IG/Threads 帳號發文,
//     不需要另外的社群帳號;狀態一律先 pending_review,除非帳號已開 auto_publish
// ============================================================================
const ECOSYSTEM_CROSS_PROMO_SOURCE = 'ecosystem_cross_promo';
const ECOSYSTEM_CROSS_PROMO_WEEKLY_TARGET = 1; // 每品牌每週目標 1 篇(輪流機制的判斷基準)

interface EcosystemAngle {
  platform: SocialPlatform;
  instruction: string;
}

// 各品牌對外提及其他品牌時的貼文角度指示;實際可引用的事實仍受 collaborationContext 限制
const ECOSYSTEM_ANGLES: Record<string, EcosystemAngle[]> = {
  homigo: [
    {
      platform: 'facebook',
      instruction: '這篇要對「房東」與「包租代管業者」這兩個目標受眾寫:房客報修不用再自己找工班,' +
        '直接串接 TaskGo 認證師傅完成派工與施工,全程留痕。用房東真實會遇到的深夜報修場景開頭。',
    },
    {
      platform: 'threads',
      instruction: '這篇要提到:透過 Homigo 管理房子的房東,也可以把 Washgo 洗衣收送服務一起接給房客,' +
        '當作租屋加值福利(不用租客自己找洗衣店)。用短文、口語的方式帶出,不要寫成正式公告。',
    },
  ],
  taskgo: [
    {
      platform: 'threads',
      instruction: '這篇從工班/師傅的角度寫:最近接到不少透過 Homigo 房東/包租代管業者串接進來的修繕案,' +
        '案源比以前穩定。用工地日常的口吻帶出,不要寫成業配文。',
    },
    {
      platform: 'facebook',
      instruction: '這篇寫給工程行老闆看:透過 Homigo 生態系接到的房東案源,如何讓派工排程更穩定、' +
        '減少空班,用具體場景帶出,結尾不用強力促銷。',
    },
  ],
  washgo: [
    {
      platform: 'facebook',
      instruction: '這篇寫給洗衣店主/連鎖業者:加入 Washgo 平台後,可以接到 Homigo 包租代管的床單布巾案源,' +
        '訂單、調撥、司機都在同一套系統。用業者會懂的場景開頭,不要寫成房客或媽媽送洗文。' +
        'CTA 一律導向匠管 Service@inforcraft.com.tw 或電話 0972-395-117。',
    },
    {
      platform: 'threads',
      instruction: '這篇提一下:透過 Homigo 管理房子的租屋族,也可以用 Washgo 到府收送洗衣服務,' +
        '或者 GoCoin 跨品牌點數可以在 Washgo 折抵。用短文、輕鬆口吻帶出,60-120 字內。',
    },
  ],
};

async function generateEcosystemCrossPromo(env: Env, slotAt: Date): Promise<void> {
  const sql = getSql(env);
  // 挑近 7 天內做過生態系導流貼文次數最少的品牌(確保三品牌均勻輪替)
  const brands = await sql`
    SELECT b.id, b.slug, b.name,
      (SELECT count(*)::int FROM contents c
        WHERE c.brand_id = b.id AND c.generation_prompt_meta->>'source' = ${ECOSYSTEM_CROSS_PROMO_SOURCE}
          AND c.created_at > now() - interval '7 days') AS recent_count
    FROM brands b
    WHERE b.is_active = true AND b.slug IN ('homigo', 'taskgo', 'washgo')
    ORDER BY recent_count ASC, b.slug ASC
    LIMIT 1
  `;
  if (!brands.length) return;
  const brand = brands[0] as { id: string; slug: string; name: string; recent_count: number };
  if (brand.recent_count >= ECOSYSTEM_CROSS_PROMO_WEEKLY_TARGET) {
    console.log(`[ecosystem] 本輪最少的品牌 ${brand.slug} 這週已輪過,先不生成`);
    return;
  }

  const angles = ECOSYSTEM_ANGLES[brand.slug];
  if (!angles?.length) return;
  const angle = angles[Math.floor(Math.random() * angles.length)];

  try {
    const collabId = await findEcosystemCollaborationId(env, brand.slug);
    if (!collabId) {
      console.error(`[ecosystem] 找不到 ${brand.slug} 所屬的 Go 生態系 Collaboration(請先執行 008 migration)`);
      return;
    }
    const collaborationContext = await buildCollaborationContext(env, collabId);
    if (!collaborationContext) {
      console.error('[ecosystem] Go 生態系 Collaboration 尚無 Brief 版本');
      return;
    }

    const brandCtx = await buildBrandContext(env, brand.id);
    const agentId = await findBrandAgent(env, brand.id);

    const ecoLane = angle.platform === 'threads' ? 'b2c' as const : 'b2b' as const;
    const result = await generatePlatformPost(env, {
      brandCtx,
      platform: angle.platform,
      topic: 'Go 生態系跨品牌導流內容',
      extraInstruction: angle.instruction,
      collaborationContext,
      audienceLane: ecoLane,
    });

    const account = angle.platform === 'threads'
      ? await getThreadsAccount(env, brand.id)
      : await getMetaAccount(env, brand.id, angle.platform as 'facebook' | 'instagram');
    const willAutoPublish = !!account?.autoPublish;

    const { contentId, versionId } = await saveGeneratedContent(env, {
      brandCtx, platform: angle.platform, result,
      generatedByAgentId: agentId,
      status: willAutoPublish ? 'scheduled' : 'pending_review',
      promptMeta: {
        source: ECOSYSTEM_CROSS_PROMO_SOURCE, collaborationId: collabId, slotAt: slotAt.toISOString(),
        audienceLane: ecoLane, audienceName: result.audienceName,
      },
    });

    if (willAutoPublish) {
      await sql`
        INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
        VALUES (${contentId}::uuid, ${versionId}::uuid, ${angle.platform}, 'scheduled', ${slotAt.toISOString()}::timestamptz)
      `;
    }

    await logActivity(env, {
      brandId: brand.id,
      collaborationId: collabId,
      actorType: 'ai_agent',
      actorAgentId: agentId,
      action: 'content.generated',
      entityType: 'content',
      entityId: contentId,
      afterState: { platform: angle.platform, source: ECOSYSTEM_CROSS_PROMO_SOURCE, scheduled: willAutoPublish, slotAt: slotAt.toISOString() },
    });
    console.log(`[ecosystem] ${brand.slug}/${angle.platform} 已排定生態系導流貼文 ${slotAt.toISOString()}(${willAutoPublish ? '自動' : '待審核'})`);
  } catch (e) {
    console.error(`[ecosystem] 品牌 ${brand.slug} 生成失敗`, e);
  }
}

// ============================================================================
// 主流程 2f:Go 生態系 X(Twitter) 帳號 — 英文獨立人格,主打國際 PropTech/SaaS 圈
//   - 每天固定 2 檔(台灣時間 09:00 / 21:00),角度輪替(單推觀點/Thread敘事/操盤手視角/
//     單品牌聚焦 TaskGo·Homigo·Washgo),排除最近 3 篇用過的角度,讓生態系整體與單品牌介紹交替出現
//   - 素材只能來自 Go 生態系 Collaboration Brief(collaborationContext),不吃任何單一品牌
//     的 BrandContext(Principle 2/3);掛名 Agent 是 brand_id=NULL 的「Go Ecosystem AI」
//   - 沿用生成/發布分離的既有模式:這裡只生成 + 存 scheduled 排程,真正發布交給 publishDueJobs
// ============================================================================
const ECOSYSTEM_X_SOURCE = 'ecosystem_x';

async function generateEcosystemXPostSlot(env: Env, slotAt: Date): Promise<void> {
  const sql = getSql(env);
  const collabId = await findEcosystemCollaborationId(env);
  if (!collabId) {
    console.error('[ecosystem-x] 找不到 Go 生態系 Collaboration(請先執行 008/009 migration)');
    return;
  }

  try {
    const collaborationContext = await buildCollaborationContext(env, collabId);
    if (!collaborationContext) {
      console.error('[ecosystem-x] Go 生態系 Collaboration 尚無 Brief 版本');
      return;
    }

    // 避免連續用同一種角度:排除最近 3 篇用過的 angleId
    const recentRows = await sql`
      SELECT generation_prompt_meta->>'angleId' AS angle_id FROM contents
      WHERE collaboration_id = ${collabId}::uuid AND generation_prompt_meta->>'source' = ${ECOSYSTEM_X_SOURCE}
      ORDER BY created_at DESC LIMIT 3
    `;
    const recentAngleIds = (recentRows as { angle_id: string | null }[]).map((r) => r.angle_id).filter((a): a is string => !!a);
    const angle = pickEcosystemXAngle(recentAngleIds);

    const agentId = await findEcosystemAgent(env);
    const spotlightSlug = SPOTLIGHT_SLUG[angle.id];
    const screenshot = spotlightSlug ? await pickBrandScreenshot(env, spotlightSlug).catch(() => null) : null;
    const result = await generateEcosystemXPost(env, {
      angle, collaborationContext,
      screenshotUrl: screenshot?.fileUrl,
      screenshotAssetId: screenshot?.id,
    });

    const account = await getXAccount(env, collabId);
    const willAutoPublish = !!account?.autoPublish;

    const { contentId, versionId } = await saveEcosystemXContent(env, {
      collaborationId: collabId,
      result,
      generatedByAgentId: agentId,
      status: willAutoPublish ? 'scheduled' : 'pending_review',
    });

    if (willAutoPublish) {
      await sql`
        INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
        VALUES (${contentId}::uuid, ${versionId}::uuid, 'x', 'scheduled', ${slotAt.toISOString()}::timestamptz)
      `;
    }

    await logActivity(env, {
      collaborationId: collabId,
      actorType: 'ai_agent',
      actorAgentId: agentId,
      action: 'content.generated',
      entityType: 'content',
      entityId: contentId,
      afterState: { platform: 'x', source: ECOSYSTEM_X_SOURCE, angle: angle.id, format: result.post.format, scheduled: willAutoPublish, slotAt: slotAt.toISOString() },
    });
    console.log(`[ecosystem-x] 已排定 ${angle.label}(${result.post.format}, ${result.post.tweets.length} 則),${slotAt.toISOString()}(${willAutoPublish ? '自動' : '待審核'})`);
  } catch (e) {
    console.error('[ecosystem-x] 生成失敗', e);
  }
}

// ============================================================================
// 主流程 4b:Go 生態系 X 帳號 token 自動續期
//   X OAuth2 access token 僅 2 小時效期,遠比 Threads 的 60 天短,因此用「快到期就續期」的
//   輕量檢查(SQL WHERE 已篩選,大部分 tick 都是 no-op),掛在每個 30 分鐘 tick 上而非每天一次
// ============================================================================
async function refreshXTokens(env: Env): Promise<void> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT collaboration_id FROM brand_social_accounts
    WHERE platform = 'x' AND collaboration_id IS NOT NULL
      AND access_token_enc IS NOT NULL AND refresh_token_enc IS NOT NULL
      AND (token_expires_at IS NULL OR token_expires_at < now() + interval '20 minutes')
  `;
  for (const row of rows as { collaboration_id: string }[]) {
    try {
      const account = await getXAccount(env, row.collaboration_id);
      if (!account) continue;
      await refreshXToken(env, account);
      console.log(`[x-token-refresh] collaboration=${row.collaboration_id} 已續期`);
    } catch (e) {
      console.error(`[x-token-refresh] collaboration=${row.collaboration_id} 續期失敗`, e);
    }
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
const ECOSYSTEM_CROSS_PROMO_HOUR_TW = 20;           // Go 生態系跨品牌導流(僅週三、週日)
const ECOSYSTEM_CROSS_PROMO_DAYS_TW = [0, 3];       // 0=週日, 3=週三(以台灣時區換算後的星期)
const ECOSYSTEM_X_HOURS_TW = [9, 21];                // Go 生態系 X 帳號:每天 2 篇(台灣 09:00 / 21:00,對應美東晚間/早晨)
const GENERATION_LEAD_HOURS = 1;                    // 生成提前量:每個時段提前 1 小時生成

/** 計算「台灣時區」星期幾(0=週日),用於 ECOSYSTEM_CROSS_PROMO_DAYS_TW 的判斷 */
function weekdayTW(date: Date): number {
  const twMs = date.getTime() + 8 * 60 * 60 * 1000;
  return new Date(twMs).getUTCDay();
}

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
    if (genHour === ECOSYSTEM_CROSS_PROMO_HOUR_TW && ECOSYSTEM_CROSS_PROMO_DAYS_TW.includes(weekdayTW(slotAt))) {
      await generateEcosystemCrossPromo(env, slotAt);
    }
    if (ECOSYSTEM_X_HOURS_TW.includes(genHour)) {
      await generateEcosystemXPostSlot(env, slotAt);
    }
  }

  // X access token 僅 2 小時效期,每個 30 分鐘 tick 都順手檢查一次(SQL 已篩選快到期才動作)
  await refreshXTokens(env);

  // 近 48 小時失敗的 Threads 每次只重試 1 則,避免半點一次塞 3 則被 Meta 擋
  await requeueRecentFailedThreads(env);

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
/** 把近期失敗的 Threads 排程重設回 scheduled,讓本輪 publishDueJobs 立刻重發 */
async function requeueRecentFailedThreads(env: Env): Promise<void> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT pj.id FROM publishing_jobs pj
      WHERE pj.platform = 'threads' AND pj.status = 'failed'
        AND pj.updated_at > now() - interval '48 hours'
        AND (
          SELECT count(*) FROM publishing_logs
          WHERE publishing_job_id = pj.id AND event = 'retried'
        ) < 3
        AND NOT EXISTS (
          SELECT 1 FROM publishing_logs lg
          WHERE lg.publishing_job_id = pj.id AND lg.event = 'failed'
            AND lg.detail ILIKE '%API access blocked%'
        )
      ORDER BY pj.scheduled_at ASC
      LIMIT 1
    `;
    for (const row of rows as { id: string }[]) {
      await sql`
        UPDATE publishing_jobs SET status = 'scheduled', scheduled_at = now(), updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      await sql`
        INSERT INTO publishing_logs (publishing_job_id, event, detail)
        VALUES (${row.id}::uuid, 'retried', '系統自動重試近期 Threads 失敗排程')
      `;
      console.log(`[publish] 已重排失敗 Threads job ${row.id}`);
    }
  } catch (e) {
    console.error('[publish] 重排失敗 Threads 排程時出錯', e);
  }
}

async function publishDueJobs(env: Env): Promise<void> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT pj.id AS job_id, pj.content_id, pj.content_version_id, pj.platform,
           c.brand_id, c.collaboration_id, b.slug AS brand_slug,
           cv.body, cv.hashtags,
           a.file_url AS image_url,
           v.file_url AS video_url
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    LEFT JOIN brands b ON b.id = c.brand_id
    LEFT JOIN content_versions cv ON cv.id = pj.content_version_id
    LEFT JOIN LATERAL (
      SELECT file_url FROM content_assets WHERE content_version_id = cv.id AND asset_type = 'image' LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT file_url FROM content_assets WHERE content_version_id = cv.id AND asset_type = 'video' LIMIT 1
    ) v ON true
    WHERE pj.status = 'scheduled' AND pj.scheduled_at <= now()
    ORDER BY pj.scheduled_at ASC
    LIMIT 10
  `;
  if (!rows.length) return;

  for (const row of rows as {
    job_id: string; content_id: string; content_version_id: string; platform: SocialPlatform | 'x';
    brand_id: string | null; collaboration_id: string | null; brand_slug: string | null;
    body: string | null; hashtags: string[] | null; image_url: string | null; video_url: string | null;
  }[]) {
    const label = row.brand_slug ?? 'go-ecosystem';
    try {
      await sql`UPDATE publishing_jobs SET status = 'publishing' WHERE id = ${row.job_id}::uuid`;
      if (!row.body) throw new Error('內容缺少貼文全文(content_versions.body 為空)');

      let published: { postId: string; permalink: string | null };
      if (row.platform === 'threads' && row.brand_id) {
        const account = await getThreadsAccount(env, row.brand_id);
        if (!account) throw new Error('Threads 帳號未連線或憑證失效');
        published = await publishThreadsPost(account, {
          text: row.body,
          imageUrl: toPublicMediaUrl(env, row.image_url),
          videoUrl: toPublicMediaUrl(env, row.video_url),
        });
      } else if (row.platform === 'facebook' && row.brand_id) {
        const account = await getMetaAccount(env, row.brand_id, 'facebook');
        if (!account) throw new Error('Facebook 帳號未連線或憑證失效');
        const message = composePostMessage(row.body, row.hashtags);
        published = await publishFacebookPost(account, { message, imageUrl: toPublicMediaUrl(env, row.image_url) });
      } else if (row.platform === 'instagram' && row.brand_id) {
        const account = await getMetaAccount(env, row.brand_id, 'instagram');
        const publicImage = toPublicMediaUrl(env, row.image_url);
        const publicVideo = toPublicMediaUrl(env, row.video_url);
        if (!account) throw new Error('Instagram 帳號未連線或憑證失效');
        const message = composePostMessage(row.body, row.hashtags);
        if (publicVideo) {
          published = await publishInstagramReel(account, { caption: message, videoUrl: publicVideo });
        } else if (publicImage) {
          published = await publishInstagramPost(account, { caption: message, imageUrl: publicImage });
        } else {
          throw new Error('Instagram 發文需要配圖或短影音');
        }
      } else if (row.platform === 'x' && row.collaboration_id) {
        const account = await getXAccount(env, row.collaboration_id);
        if (!account) throw new Error('X 帳號未連線或憑證失效');
        // Thread 的多則推文存成同一個 body,用 "\n---\n" 分隔(見 saveEcosystemXContent)
        const tweets = row.body.split('\n---\n').map((t) => t.trim()).filter(Boolean);
        const publicImage = toPublicMediaUrl(env, row.image_url);
        const firstTweet = tweets.length > 1
          ? (await publishTweetThread(account, tweets, publicImage))[0]
          : await publishTweet(account, { text: tweets[0] ?? row.body, imageUrl: publicImage });
        published = { postId: firstTweet.tweetId, permalink: firstTweet.permalink };
      } else {
        throw new Error(`不支援自動發布的平台或缺少對應的帳號範圍:${row.platform}`);
      }

      await sql`
        UPDATE publishing_jobs SET status = 'published', published_at = now(),
          external_post_id = ${published.postId}
        WHERE id = ${row.job_id}::uuid
      `;
      await sql`UPDATE contents SET status = 'published', updated_at = now() WHERE id = ${row.content_id}::uuid`;
      await sql`
        INSERT INTO publishing_logs (publishing_job_id, event, detail)
        VALUES (${row.job_id}::uuid, 'published', ${published.permalink ?? published.postId})
      `;
      console.log(`[publish] ${label}/${row.platform} 已發布:${published.permalink ?? published.postId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sql`UPDATE publishing_jobs SET status = 'failed' WHERE id = ${row.job_id}::uuid`;
      await sql`
        INSERT INTO publishing_logs (publishing_job_id, event, detail)
        VALUES (${row.job_id}::uuid, 'failed', ${msg.slice(0, 500)})
      `;
      if (row.platform === 'threads' && row.brand_id && isThreadsAccessBlocked(msg)) {
        await sql`
          UPDATE brand_social_accounts
          SET status = 'error', notes = ${THREADS_ACCESS_BLOCKED_NOTE}, updated_at = now()
          WHERE brand_id = ${row.brand_id}::uuid AND platform = 'threads'
        `;
        console.error(`[publish] ${label} Threads API access blocked,已暫停自動發文`);
      }
      if ((row.platform === 'facebook' || row.platform === 'instagram') && row.brand_id && isMetaTokenInvalid(msg)) {
        await sql`
          UPDATE brand_social_accounts
          SET status = 'error', notes = ${META_TOKEN_INVALID_NOTE}, updated_at = now()
          WHERE brand_id = ${row.brand_id}::uuid AND platform IN ('facebook', 'instagram')
        `;
        console.error(`[publish] ${label} FB/IG 權杖失效,已暫停自動發文`);
      }
      console.error(`[publish] ${label}/${row.platform} 發布失敗`, e);
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
        ctx.waitUntil(collectPressMentions(env));
        ctx.waitUntil(
          syncPerformanceInsights(env)
            .then(() => analyzeAllBrandPerformance(env))
            .catch((e) => console.error('[insights] 成效回收或歸因失敗', e)),
        );
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
        ctx.waitUntil(collectPressMentions(env));
    }
  },

  // 手動觸發除錯用:GET /?task=collect|drafts|threads|offtopic|replies|themes|catchup|ecosystem|ecosystem-x|publish|cleanup|podcast|refresh-tokens|refresh-x-tokens|insights|learn(需帶 secret)
  // threads/offtopic/themes 可帶 &slotAt=ISO時間 指定要排定發布的時段(預設現在,方便測試)
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const task = url.searchParams.get('task');
    const secret = url.searchParams.get('secret');
    if (!secret || secret !== (env.SESSION_SECRET ?? env.ADMIN_PASSWORD)) {
      return new Response('Unauthorized', { status: 401 });
    }
    const slotAt = new Date(url.searchParams.get('slotAt') ?? Date.now());
    const run = async (): Promise<unknown> => {
      if (task === 'collect') return collectSignals(env);
      if (task === 'press') return collectPressMentions(env);
      if (task === 'drafts') return generateSignalDrafts(env);
      if (task === 'threads') return generateThreadsSlot(env, slotAt);
      if (task === 'offtopic') return generateThreadsOfftopicSlot(env, slotAt);
      if (task === 'replies') return threadsReplyRound(env);
      if (task === 'themes') return generateDailyTheme(env, slotAt);
      if (task === 'catchup') return catchupTodayAutoPosts(env);
      if (task === 'ecosystem') return generateEcosystemCrossPromo(env, slotAt);
      if (task === 'ecosystem-x') return generateEcosystemXPostSlot(env, slotAt);
      if (task === 'publish') return publishDueJobs(env);
      if (task === 'cleanup') return cleanupOldMedia(env);
      if (task === 'refresh-tokens') return refreshThreadsTokens(env);
      if (task === 'refresh-x-tokens') return refreshXTokens(env);
      if (task === 'insights') return syncPerformanceInsights(env);
      if (task === 'learn') return analyzeAllBrandPerformance(env);
      if (task === 'podcast') return createPodcastEpisode(env);
      return null;
    };
    const known = ['collect', 'press', 'drafts', 'threads', 'offtopic', 'replies', 'themes', 'catchup', 'ecosystem', 'ecosystem-x', 'publish', 'cleanup', 'podcast', 'refresh-tokens', 'refresh-x-tokens', 'insights', 'learn'];
    if (!task || !known.includes(task)) {
      return new Response(`task 必須為 ${known.join(' / ')}`, { status: 400 });
    }
    // 產圖/發文可能超過 HTTP 30 秒,改背景跑,避免手動觸發被切斷
    ctx.waitUntil(run().catch((e) => console.error(`[manual] ${task} 失敗`, e)));
    return new Response(JSON.stringify({ ok: true, task, accepted: true }), { headers: { 'Content-Type': 'application/json' } });
  },
};
