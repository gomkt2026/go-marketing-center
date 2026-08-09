import type { ScheduledController, ExecutionContext } from '@cloudflare/workers-types';
import type { Env } from '../../../functions/_shared/env';
import { getSql } from '../../../functions/_shared/db';
import { chatCompleteJson } from '../../../functions/_shared/openai';
import { buildBrandContext, getBrandVoice, ANTI_AI_RULES } from '../../../functions/_shared/prompts';
import { generatePlatformPost, saveGeneratedContent, findBrandAgent } from '../../../functions/_shared/generate';
import { getThreadsAccount, publishThreadsPost, searchThreadsPosts, type ThreadsSearchPost } from '../../../functions/_shared/threads';
import { publishReplyTarget, replyTextIssue } from '../../../functions/_shared/threads-replies';
import { logActivity } from '../../../functions/_shared/activity';
import { fetchGoogleTrendsTW, fetchGoogleNews, fetchTaiwanNews, fetchPttBoard, fetchDcard, type TrendItem } from '../../../functions/_shared/sources';

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
// 主流程 2:Threads 熱門議題貼文(每品牌每小時一篇)
//   - 每 tick 處理最久沒發的 2 個品牌;同品牌 55 分鐘內不重發 → 每小時恰一篇
//   - 熱門議題來源:Google Trends TW + 近期自抓的社群情報(PTT/Dcard)
//   - 品牌已連 Threads API 且開啟自動發布 → 直接發布;否則存草稿
// ============================================================================
const THREADS_DAILY_CAP = 24; // 每品牌每日上限(每小時一篇)
const THREADS_BRANDS_PER_TICK = 2;
const THREADS_MIN_INTERVAL_MS = 55 * 60 * 1000; // 每品牌至少間隔 55 分鐘

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

  for (const brand of brands as { id: string; slug: string; name: string; last_at: string | null; today_count: number }[]) {
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

      const result = await generatePlatformPost(env, {
        brandCtx,
        platform: 'threads',
        topic: `台灣現在的熱門話題:${trendList}`,
        extraInstruction: [
          '從上面的熱門話題挑「一個」最能跟品牌日常自然掛勾的,寫一則 Threads 跟風文。' +
          '如果全部都掛不上,就寫一則品牌日常 observation 文(第一線工作看到的趣事)。不要硬蹭。',
          socialTopics.length
            ? `目前社群(PTT/Dcard)正在討論的行業話題,也可以從這裡取材:\n${socialTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
            : '',
        ].filter(Boolean).join('\n\n'),
      });

      const account = await getThreadsAccount(env, brand.id);
      const willAutoPublish = !!account?.autoPublish;

      const { contentId, versionId } = await saveGeneratedContent(env, {
        brandCtx,
        platform: 'threads',
        result,
        generatedByAgentId: agentId,
        status: 'draft',
        promptMeta: { source: 'threads_hourly', trends: trends.map((t) => t.title), socialTopics },
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
// 主流程 2b:FB/IG 每日主題圖文(每天每品牌 2 篇:早上 8 點檔 + 晚上 8 點檔)
//   台灣 08:00-09:59 補第 1 篇、20:00-21:59 補第 2 篇;每 tick 只處理一個品牌
// ============================================================================
const DAILY_THEME_TARGET = 2;

/**
 * targetCount:這個時段每品牌應達到的當日主題數(早上時窗=1,晚上時窗=2)。
 * 回傳 true 表示這個 tick 已經做了主題生成(呼叫端應跳過 Threads 輪)
 */
async function generateDailyTheme(env: Env, targetCount: number = DAILY_THEME_TARGET): Promise<boolean> {
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
  if (brand.theme_count >= targetCount) return false;

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
// */30 統一調度:
//   - 台灣 08:00-09:59 → 補每品牌「當日第 1 篇」FB/IG 主題圖文(早上 8 點檔)
//   - 台灣 20:00-21:59 → 補每品牌「當日第 2 篇」FB/IG 主題圖文(晚上 8 點檔)
//   - 整點 tick 跑 Threads 發文輪;半點 tick 跑 Threads 熱門貼文回覆輪
//     (兩輪錯開,控制單次 Workers 子請求數量)
// ============================================================================
async function halfHourlyDispatch(env: Env): Promise<void> {
  const twHour = (new Date().getUTCHours() + 8) % 24;
  if (twHour >= 8 && twHour < 10) {
    const didTheme = await generateDailyTheme(env, 1);
    if (didTheme) return; // 主題生成已耗掉大量子請求,這個 tick 不再跑 Threads
  } else if (twHour >= 20 && twHour < 22) {
    const didTheme = await generateDailyTheme(env, 2);
    if (didTheme) return;
  }
  const minute = new Date().getUTCMinutes();
  if (minute >= 15 && minute < 45) {
    await threadsReplyRound(env);
  } else {
    await threadsRound(env);
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
        break;
      default:
        ctx.waitUntil(collectSignals(env));
    }
  },

  // 手動觸發除錯用:GET /?task=collect|drafts|threads|replies|themes|cleanup(需帶 secret)
  // themes 可帶 &target=1|2 指定要補到當日第幾篇
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
    else if (task === 'replies') await threadsReplyRound(env);
    else if (task === 'themes') await generateDailyTheme(env, Number(url.searchParams.get('target') ?? DAILY_THEME_TARGET));
    else if (task === 'cleanup') await cleanupOldMedia(env);
    else return new Response('task 必須為 collect / drafts / threads / replies / themes / cleanup', { status: 400 });
    return new Response(JSON.stringify({ ok: true, task }), { headers: { 'Content-Type': 'application/json' } });
  },
};
