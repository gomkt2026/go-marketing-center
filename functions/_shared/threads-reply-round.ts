import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { getBrandVoice, ANTI_AI_RULES } from './prompts';
import { getThreadsAccount, searchThreadsPosts, type ThreadsAccount, type ThreadsSearchPost } from './threads';
import {
  publishReplyTarget, replyTextIssue, getReplyQuotaState, replyQuotaIssue,
  THREADS_REPLY_KEYWORDS, recordReplyScan, snapshotKeywordHits, type ThreadsKeywordHit,
} from './threads-replies';
import { logActivity } from './activity';
import { fetchGoogleTrendsTW } from './sources';

// ============================================================================
// 單一品牌 Threads 回覆輪:搜尋 → AI 挑文寫回覆 → 入庫 →(可)自動發布
//   scheduler 半點 tick 與前台「立即掃文入庫」共用,避免診斷與入庫分叉
// ============================================================================

export const REPLY_RELEVANCE_MIN = 0.7;
export const REPLY_KEYWORDS_PER_ROUND = 3;
export const REPLY_CANDIDATES_FOR_AI = 8;
export const REPLY_MAX_QUEUED_PER_ROUND = 4;
export const REPLY_MAX_AUTO_PUBLISH_PER_ROUND = 3;
export const REPLY_PENDING_QUEUE_LIMIT = 10;
export const REPLY_MIN_INTERVAL_MS = 8 * 60 * 1000;
export const REPLY_MAX_POST_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const REPLY_FRESH_MS = 48 * 60 * 60 * 1000;

interface ReplySelection {
  index: number;
  relevance: number;
  reason: string;
  reply: string;
}

export interface BrandReplyRoundResult {
  ok: boolean;
  /** cron 輪詢是否佔用「本輪品牌名額」;無帳號 / 失敗暫停 / 額度滿 不佔名額 */
  counted: boolean;
  status: 'no_account' | 'failed_pause' | 'quota' | 'blocked_search' | 'empty' | 'queued' | 'published' | 'queue_full';
  detail: string;
  canSearchPublic: boolean;
  autoReply: boolean;
  keywords: string[];
  found: number;
  ownCount: number;
  publicCount: number;
  queued: number;
  published: number;
  hits: ThreadsKeywordHit[];
}

function emptyResult(partial: Partial<BrandReplyRoundResult> & Pick<BrandReplyRoundResult, 'status' | 'detail'>): BrandReplyRoundResult {
  return {
    ok: partial.ok ?? false,
    counted: partial.counted ?? false,
    status: partial.status,
    detail: partial.detail,
    canSearchPublic: partial.canSearchPublic ?? false,
    autoReply: partial.autoReply ?? false,
    keywords: partial.keywords ?? [],
    found: partial.found ?? 0,
    ownCount: partial.ownCount ?? 0,
    publicCount: partial.publicCount ?? 0,
    queued: partial.queued ?? 0,
    published: partial.published ?? 0,
    hits: partial.hits ?? [],
  };
}

async function findBrandAgent(env: Env, brandId: string): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE a.brand_id = ${brandId}::uuid AND a.is_active = true
    ORDER BY (r.code = 'brand_ai') DESC
    LIMIT 1
  `;
  return rows.length ? (rows[0] as { id: string }).id : null;
}

function replyHeatRank(a: ThreadsSearchPost, b: ThreadsSearchPost): number {
  const now = Date.now();
  const age = (p: ThreadsSearchPost) => p.timestamp ? now - new Date(p.timestamp).getTime() : Number.MAX_SAFE_INTEGER;
  const recency = (p: ThreadsSearchPost) => {
    const ms = age(p);
    if (ms < 24 * 60 * 60 * 1000) return 2;
    if (ms < REPLY_FRESH_MS) return 1;
    return 0;
  };
  const heat = Number(b.hasReplies) - Number(a.hasReplies);
  if (heat !== 0) return heat;
  const fresh = recency(b) - recency(a);
  if (fresh !== 0) return fresh;
  return age(a) - age(b);
}

async function autoPublishPendingReplies(
  env: Env,
  params: {
    brandId: string;
    brandSlug: string;
    account: ThreadsAccount;
    lastRepliedAt: string | null;
    replied1h: number;
    replied24h: number;
  },
): Promise<number> {
  const account = params.account;
  const intervalOk = !params.lastRepliedAt ||
    Date.now() - new Date(params.lastRepliedAt).getTime() >= REPLY_MIN_INTERVAL_MS;
  if (!intervalOk) {
    console.log(`[replies] ${params.brandSlug} 距上次回覆未滿間隔,本輪不自動發`);
    return 0;
  }

  let remaining = Math.min(
    REPLY_MAX_AUTO_PUBLISH_PER_ROUND,
    account.replyHourlyCap - params.replied1h,
    account.replyDailyCap - params.replied24h,
  );
  if (remaining <= 0) return 0;

  const sql = getSql(env);
  const pending = await sql`
    SELECT id FROM threads_reply_targets
    WHERE brand_id = ${params.brandId}::uuid
      AND status = 'pending'
      AND reply_text IS NOT NULL
    ORDER BY relevance_score DESC NULLS LAST, created_at ASC
    LIMIT ${remaining}
  `;
  let published = 0;
  for (const row of pending as { id: string }[]) {
    const quota = replyQuotaIssue({
      replied1h: params.replied1h,
      replied24h: params.replied24h,
      hourlyCap: account.replyHourlyCap,
      dailyCap: account.replyDailyCap,
    });
    if (quota) {
      console.log(`[replies] ${params.brandSlug} ${quota}`);
      break;
    }
    const result = await publishReplyTarget(env, { targetId: row.id, account });
    if (result.ok) {
      params.replied1h += 1;
      params.replied24h += 1;
      remaining -= 1;
      published += 1;
      console.log(`[replies] ${params.brandSlug} 已自動回覆:${result.replyPermalink ?? result.replyPostId}`);
    } else {
      console.error(`[replies] ${params.brandSlug} 自動回覆失敗:${result.error}`);
      break;
    }
  }
  return published;
}

/**
 * 跑一輪指定品牌的搜尋 / 入庫 / 自動發布。
 * mode=cron:與排程相同,失敗暫停或額度滿時跳過(不佔名額)
 * mode=manual:前台立即掃文;仍會搜尋入庫,額度滿或失敗暫停只擋自動發布
 */
export async function processBrandReplyRound(env: Env, params: {
  brandId: string;
  brandSlug: string;
  brandName: string;
  mode?: 'cron' | 'manual';
}): Promise<BrandReplyRoundResult> {
  const mode = params.mode ?? 'cron';
  const account = await getThreadsAccount(env, params.brandId);
  if (!account) {
    const detail = '品牌尚未連接可用的 Threads 帳號';
    if (mode === 'manual') {
      await recordReplyScan(env, params.brandId, detail, { canSearchPublic: false });
    }
    return emptyResult({ status: 'no_account', detail, counted: false });
  }

  const state = await getReplyQuotaState(env, params.brandId);
  const quotaBlocked = !!replyQuotaIssue({
    replied1h: state.replied1h,
    replied24h: state.replied24h,
    hourlyCap: account.replyHourlyCap,
    dailyCap: account.replyDailyCap,
  });

  if (mode === 'cron' && state.failedRecent > 0) {
    const detail = '近 12 小時有發布失敗,本輪跳過';
    console.log(`[replies] ${params.brandSlug} ${detail}`);
    return emptyResult({ status: 'failed_pause', detail, counted: false, autoReply: account.autoReply });
  }
  if (mode === 'cron' && quotaBlocked) {
    const detail = `已達回覆上限(小時 ${state.replied1h}/${account.replyHourlyCap}, 日 ${state.replied24h}/${account.replyDailyCap}),本輪跳過`;
    console.log(`[replies] ${params.brandSlug} ${detail}`);
    return emptyResult({ status: 'quota', detail, counted: false, autoReply: account.autoReply });
  }

  const sql = getSql(env);
  const queueFull = state.pendingCount >= REPLY_PENDING_QUEUE_LIMIT;
  const baseKeywords = THREADS_REPLY_KEYWORDS[params.brandSlug] ?? [params.brandName];
  const keywords: string[] = [];
  let found: (ThreadsSearchPost & { sourceKeyword: string })[] = [];

  if (queueFull) {
    console.log(`[replies] ${params.brandSlug} 待審佇列已滿 ${REPLY_PENDING_QUEUE_LIMIT},本輪只消化自動回覆`);
  } else {
    let trendKeywords: string[] = [];
    try {
      const trends = await fetchGoogleTrendsTW(10);
      trendKeywords = trends
        .map((t) => t.title)
        .filter((title) => baseKeywords.some((k) => title.includes(k)));
    } catch { /* trends 抓不到不影響 */ }
    const shuffled = [...baseKeywords].sort(() => Math.random() - 0.5);
    keywords.push(...[...new Set([...trendKeywords, ...shuffled])].slice(0, REPLY_KEYWORDS_PER_ROUND));

    for (const kw of keywords) {
      try {
        const posts = await searchThreadsPosts(account, kw, 25);
        found.push(...posts.map((p) => ({ ...p, sourceKeyword: kw })));
      } catch (e) {
        console.error(`[replies] ${params.brandSlug} 搜尋「${kw}」失敗`, e);
      }
    }
  }

  const ownUsername = (account.username ?? '').toLowerCase();
  const ownCount = found.filter((p) => (p.username ?? '').toLowerCase() === ownUsername).length;
  const publicCount = Math.max(0, found.length - ownCount);
  const canSearchPublic = publicCount > 0;
  const hits = snapshotKeywordHits(found, ownUsername);

  const publishIfEnabled = async (queued: number, status: BrandReplyRoundResult['status'], detail: string) => {
    let published = 0;
    const paused = state.failedRecent > 0;
    const canAuto = account.autoReply && !quotaBlocked && !paused;
    if (canAuto) {
      published = await autoPublishPendingReplies(env, {
        brandId: params.brandId,
        brandSlug: params.brandSlug,
        account,
        lastRepliedAt: state.lastRepliedAt,
        replied1h: state.replied1h,
        replied24h: state.replied24h,
      });
    }
    let finalStatus = status;
    let finalDetail = detail;
    if (paused && account.autoReply) {
      finalDetail = `${detail}；近 12 小時有發布失敗,本輪不自動發`;
    } else if (quotaBlocked && account.autoReply) {
      finalDetail = `${detail}；已達回覆上限,本輪不自動發`;
    } else if (published > 0) {
      finalStatus = 'published';
      finalDetail = `${detail}；已自動發布 ${published} 則`;
    } else if (account.autoReply && queued > 0) {
      finalDetail = `${detail}；自動回覆已開,本輪沒有可立即發布的待審稿`;
    }
    const searched = !queueFull;
    await recordReplyScan(env, params.brandId, finalDetail, {
      keywords, queued, published,
      ...(searched ? { total: found.length, ownCount, publicCount, canSearchPublic, hits } : {}),
    });
    return emptyResult({
      ok: status !== 'blocked_search' && status !== 'no_account',
      counted: true,
      status: finalStatus,
      detail: finalDetail,
      canSearchPublic: searched ? canSearchPublic : false,
      autoReply: account.autoReply,
      keywords,
      found: found.length,
      ownCount,
      publicCount,
      queued,
      published,
      hits: searched ? hits : [],
    });
  };

  if (queueFull) {
    return publishIfEnabled(0, 'queue_full', `待審佇列已滿 ${REPLY_PENDING_QUEUE_LIMIT} 則,請先核准或略過`);
  }

  if (!found.length) {
    const detail = keywords.length
      ? `關鍵字「${keywords.join('、')}」沒有搜到貼文。token 可能缺少 threads_keyword_search,或 App 還在開發模式。`
      : '本輪未執行搜尋';
    console.log(`[replies] ${params.brandSlug} ${detail}`);
    return publishIfEnabled(0, 'blocked_search', detail);
  }

  const postIds = found.map((p) => p.id);
  const [seenRows, authorRows] = await Promise.all([
    sql`SELECT target_post_id FROM threads_reply_targets WHERE brand_id = ${params.brandId}::uuid AND target_post_id = ANY(${postIds})`,
    sql`
      SELECT DISTINCT lower(target_username) AS username FROM threads_reply_targets
      WHERE brand_id = ${params.brandId}::uuid AND target_username IS NOT NULL
        AND status IN ('replied', 'pending', 'approved')
        AND created_at > now() - interval '7 days'
    `,
  ]);
  const seenIds = new Set((seenRows as { target_post_id: string }[]).map((r) => r.target_post_id));
  const cooledAuthors = new Set((authorRows as { username: string }[]).map((r) => r.username));
  const uniq = new Set<string>();
  const candidates = found
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
    .sort(replyHeatRank)
    .slice(0, REPLY_CANDIDATES_FOR_AI);

  if (!candidates.length) {
    const detail = ownCount === found.length
      ? `搜到 ${found.length} 則都是自己的帳號 @${account.username}。Meta 規定 threads_keyword_search 未過 App Review 前只能搜自己的文,自動回覆佇列會是空的。`
      : `搜到 ${found.length} 則,過濾後沒有可回覆的公開文(太舊、已處理、作者冷卻或是回覆串)。`;
    console.log(`[replies] ${params.brandSlug} ${detail}`);
    return publishIfEnabled(0, canSearchPublic ? 'empty' : 'blocked_search', detail);
  }

  const voice = getBrandVoice(params.brandSlug);
  const agentId = await findBrandAgent(env, params.brandId);
  const listText = candidates
    .map((p, i) => `${i}. @${p.username ?? '匿名'}:${p.text!.slice(0, 280)}`)
    .join('\n---\n');
  const selection = await chatCompleteJson<{ selections: ReplySelection[] }>(env, {
    temperature: 0.9,
    messages: [
      {
        role: 'system',
        content: [
          `你是品牌「${params.brandName}」的第一線人員,正在用個人身分逛 Threads、跟大家聊天。${voice.frontlinePersona}`,
          voice.replyCraft ?? '',
          ANTI_AI_RULES,
          '這是留言不是貼文:禁止放電話、Email、LINE、官網、匠管聯絡方式。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `以下是 Threads 上搜到的熱門貼文,挑「最多 ${REPLY_MAX_QUEUED_PER_ROUND} 則」你真的有話想說的來回覆(relevance 至少 ${REPLY_RELEVANCE_MIN} 才選,寧缺勿濫):`,
          listText,
          '',
          '回覆鐵則(違反任何一條就不要選那則):',
          '1. 像真人搭話:分享自己第一線的經驗或輕 KUSO 接梗,30-120 字。',
          voice.replyCraft ?? '',
          '2. 絕對不放連結、不提優惠促銷、不推銷服務、不叫人私訊;可以自然透露你的職業身分。',
          '3. 不說教、不糾正對方;先同理再補充,或幽默接梗。KUSO 只准自嘲自己的工作,不准嘲諷發文的人。',
          '4. 政治、宗教、災難、性別對立等爭議話題一律不回。',
          '5. 不要寫系統測試句。',
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

  const pickedIndexes = new Set(picked.map((s) => s.index));
  const insertedIds: string[] = [];
  for (const sel of picked) {
    const p = candidates[sel.index];
    const rows = await sql`
      INSERT INTO threads_reply_targets (
        brand_id, target_post_id, target_permalink, target_username, target_text, target_timestamp,
        source_keyword, relevance_score, relevance_reason, reply_text, status, generated_by_agent_id
      ) VALUES (
        ${params.brandId}::uuid, ${p.id}, ${p.permalink}, ${p.username}, ${p.text}, ${p.timestamp},
        ${p.sourceKeyword}, ${Math.min(1, Math.max(0, sel.relevance))}, ${sel.reason},
        ${sel.reply.trim()}, 'pending', ${agentId}
      ) ON CONFLICT (brand_id, target_post_id) DO NOTHING
      RETURNING id
    `;
    if (rows.length) {
      const id = (rows[0] as { id: string }).id;
      insertedIds.push(id);
      await logActivity(env, {
        brandId: params.brandId,
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
        ${params.brandId}::uuid, ${p.id}, ${p.permalink}, ${p.username}, ${p.text}, ${p.timestamp},
        ${p.sourceKeyword}, 'skipped'
      ) ON CONFLICT (brand_id, target_post_id) DO NOTHING
    `;
  }

  const scanDetail = `關鍵字「${keywords.join('、')}」候選 ${candidates.length} 則,入庫 ${insertedIds.length} 則`;
  console.log(`[replies] ${params.brandSlug} ${scanDetail}`);
  return publishIfEnabled(insertedIds.length, insertedIds.length ? 'queued' : 'empty', scanDetail);
}
