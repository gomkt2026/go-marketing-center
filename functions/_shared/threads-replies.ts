import type { Env } from './env';
import { getSql } from './db';
import { getThreadsAccount, replyToThreadsPost, diagnoseThreadsKeywordSearch, type ThreadsAccount } from './threads';
import { logActivity } from './activity';
import { isThreadsSafetyBlocked } from './social-safety';
import { chatCompleteJson } from './openai';
import { getBrandVoice, ANTI_AI_RULES } from './prompts';

// ============================================================================
// Threads 熱門貼文回覆佇列:共用的安全檢查與發布邏輯
//   (scheduler 自動發布與前台人工核准共用)
// ============================================================================

export const REPLY_HOURLY_CAP_DEFAULT = 5;
export const REPLY_HOURLY_CAP_MAX = 20;
export const REPLY_DAILY_CAP_DEFAULT = 12;
export const REPLY_DAILY_CAP_MAX = 50;

/** 搜尋用關鍵字(與新聞 filterKeywords 分開,避免把派工痛點詞灌進一般新聞篩選) */
export const THREADS_REPLY_KEYWORDS: Record<string, string[]> = {
  taskgo: [
    '裝修', '裝潢', '工班', '翻新', '缺工', '工地', '建材', '室內設計', '水電', '漏水',
    '排班', '管帳', '估價', '派工', '工班進度', '做白工',
  ],
  washgo: [
    '洗衣', '乾洗', '衣物', '棉被', '羽絨', '換季', '收納', '梅雨', '潮濕', '黴',
    '發霉', '洗羽絨衣', '床墊', '窗簾', '店家外送',
  ],
  homigo: [
    '租屋', '租金', '房東', '房客', '租客', '包租', '社宅', '房市', '押金', '租約', '囤房',
  ],
};

export function clampReplyHourlyCap(n: number | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return REPLY_HOURLY_CAP_DEFAULT;
  return Math.max(1, Math.min(REPLY_HOURLY_CAP_MAX, Math.round(v)));
}

export function clampReplyDailyCap(n: number | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return REPLY_DAILY_CAP_DEFAULT;
  return Math.max(1, Math.min(REPLY_DAILY_CAP_MAX, Math.round(v)));
}

export interface ReplyQuotaState {
  replied1h: number;
  replied24h: number;
  lastRepliedAt: string | null;
  failedRecent: number;
  pendingCount: number;
}

export async function getReplyQuotaState(env: Env, brandId: string): Promise<ReplyQuotaState> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT
      count(*) FILTER (WHERE status = 'replied' AND replied_at > now() - interval '1 hour')::int AS replied_1h,
      count(*) FILTER (WHERE status = 'replied' AND replied_at > now() - interval '24 hours')::int AS replied_24h,
      max(replied_at) FILTER (WHERE status = 'replied') AS last_replied_at,
      count(*) FILTER (WHERE status = 'failed' AND updated_at > now() - interval '12 hours')::int AS failed_recent,
      count(*) FILTER (WHERE status = 'pending')::int AS pending_count
    FROM threads_reply_targets WHERE brand_id = ${brandId}::uuid
  `;
  const row = (rows[0] ?? {}) as {
    replied_1h?: number; replied_24h?: number; last_replied_at?: string | null;
    failed_recent?: number; pending_count?: number;
  };
  return {
    replied1h: row.replied_1h ?? 0,
    replied24h: row.replied_24h ?? 0,
    lastRepliedAt: row.last_replied_at ?? null,
    failedRecent: row.failed_recent ?? 0,
    pendingCount: row.pending_count ?? 0,
  };
}

/** 回傳 null 表示還可以發;否則是給操作者看的原因 */
export function replyQuotaIssue(params: {
  replied1h: number;
  replied24h: number;
  hourlyCap: number;
  dailyCap: number;
}): string | null {
  if (params.replied1h >= params.hourlyCap) {
    return `已達每小時回覆上限 ${params.hourlyCap} 則,請稍後再發`;
  }
  if (params.replied24h >= params.dailyCap) {
    return `已達每日回覆上限 ${params.dailyCap} 則`;
  }
  return null;
}

export const SEARCH_HIT_PREVIEW_LIMIT = 20;
export const SEARCH_HIT_TEXT_MAX = 280;
export const DEMO_REPLY_TEXT = '這則先回一下，確認關鍵字搜尋後可以留言。';

export interface ThreadsKeywordHit {
  id: string;
  text: string | null;
  username: string | null;
  permalink: string | null;
  timestamp: string | null;
  sourceKeyword: string;
  isOwn: boolean;
}

export function snapshotKeywordHits(
  posts: Array<{
    id: string;
    text: string | null;
    username: string | null;
    permalink: string | null;
    timestamp: string | null;
    sourceKeyword: string;
  }>,
  ownUsername: string,
): ThreadsKeywordHit[] {
  const own = ownUsername.toLowerCase();
  const seen = new Set<string>();
  const hits: ThreadsKeywordHit[] = [];
  for (const p of posts) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    hits.push({
      id: p.id,
      text: p.text ? p.text.slice(0, SEARCH_HIT_TEXT_MAX) : null,
      username: p.username,
      permalink: p.permalink,
      timestamp: p.timestamp,
      sourceKeyword: p.sourceKeyword,
      isOwn: (p.username ?? '').toLowerCase() === own,
    });
    if (hits.length >= SEARCH_HIT_PREVIEW_LIMIT) break;
  }
  return hits;
}

function parseKeywordHits(raw: unknown): ThreadsKeywordHit[] {
  if (!Array.isArray(raw)) return [];
  const hits: ThreadsKeywordHit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id) continue;
    hits.push({
      id: p.id,
      text: typeof p.text === 'string' ? p.text : null,
      username: typeof p.username === 'string' ? p.username : null,
      permalink: typeof p.permalink === 'string' ? p.permalink : null,
      timestamp: typeof p.timestamp === 'string' ? p.timestamp : null,
      sourceKeyword: typeof p.sourceKeyword === 'string' ? p.sourceKeyword : '',
      isOwn: p.isOwn === true,
    });
  }
  return hits;
}

export async function recordReplyScan(env: Env, brandId: string, detail: string, extra?: Record<string, unknown>): Promise<void> {
  await logActivity(env, {
    brandId,
    actorType: 'ai_agent',
    action: 'threads_reply.scan',
    entityType: 'brand',
    entityId: brandId,
    afterState: { detail, ...extra },
  });
}

export interface LatestReplyScan {
  at: string;
  detail: string;
  canSearchPublic: boolean | null;
  publicCount: number | null;
  queued: number | null;
  keywords: string[];
  hits: ThreadsKeywordHit[];
}

function parseScanState(raw: unknown): {
  detail?: string;
  canSearchPublic?: boolean;
  publicCount?: number;
  queued?: number;
  keywords?: string[];
  hits?: unknown;
} {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as {
        detail?: string; canSearchPublic?: boolean; publicCount?: number;
        queued?: number; keywords?: string[]; hits?: unknown;
      };
    } catch { return { detail: raw }; }
  }
  return (raw ?? {}) as {
    detail?: string; canSearchPublic?: boolean; publicCount?: number;
    queued?: number; keywords?: string[]; hits?: unknown;
  };
}

export async function getLatestReplyScan(env: Env, brandId: string): Promise<LatestReplyScan | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT created_at, after_state
    FROM activity_logs
    WHERE brand_id = ${brandId}::uuid AND action = 'threads_reply.scan'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as { created_at: string; after_state: unknown };
  const state = parseScanState(row.after_state);
  const canSearchPublic = typeof state.canSearchPublic === 'boolean'
    ? state.canSearchPublic
    : (typeof state.publicCount === 'number' ? state.publicCount > 0 : null);
  return {
    at: row.created_at,
    detail: state.detail ?? '',
    canSearchPublic,
    publicCount: typeof state.publicCount === 'number' ? state.publicCount : null,
    queued: typeof state.queued === 'number' ? state.queued : null,
    keywords: Array.isArray(state.keywords) ? state.keywords.filter((k): k is string => typeof k === 'string') : [],
    hits: parseKeywordHits(state.hits),
  };
}

/** 用品牌第一個痛點關鍵字探測能不能搜到別人的公開文 */
export async function diagnoseBrandReplySearch(env: Env, brandId: string, slug: string) {
  const account = await getThreadsAccount(env, brandId);
  if (!account) {
    return { ok: false, detail: '品牌尚未連接可用的 Threads 帳號' };
  }
  const keyword = (THREADS_REPLY_KEYWORDS[slug] ?? [slug])[0];
  const result = await diagnoseThreadsKeywordSearch(account, keyword);
  await recordReplyScan(env, brandId, result.detail, {
    keyword: result.keyword, total: result.total, ownCount: result.ownCount, publicCount: result.publicCount,
  });
  return result;
}

/** 程式層安全檢查:回傳 null 表示通過,否則回傳問題描述 */
export function replyTextIssue(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (t.length < 10) return '回覆內容過短';
  if (t.length > 480) return '回覆超過 Threads 長度上限';
  if (/https?:\/\/|www\.|\.com\b|\.tw\b|\.net\b/i.test(t)) return '回覆不可包含連結';
  if (/(優惠|折扣|限時|下單|購買|私訊我|加\s?line|加賴|官網|報名連結)/i.test(t)) return '回覆不可包含促銷用語';
  if (/這則先回一下|確認關鍵字搜尋後可以留言/.test(t)) return '請改成品牌口吻,不要用系統測試句';
  return null;
}

export interface ThreadsReplyGuide {
  persona: string;
  logic: string[];
  kusoExamples: string[];
  donts: string[];
}

export interface ThreadsReplyDraft {
  label: string;
  text: string;
  why: string;
}

const REPLY_GUIDES: Record<string, ThreadsReplyGuide> = {
  washgo: {
    persona: '洗衣店櫃台店員，像鄰居年輕店員在 Threads 跟大家哈拉。',
    logic: [
      '先接對方的煩：發霉、羽絨扁、洗標天書、梅雨曬不乾、換季衣櫃爆炸',
      '再補一句現場觀察或洗衣小知識，不要上課、不要客服罐頭',
      'KUSO 只准自嘲櫃台日常，不要嘲諷發文的人',
      '不放連結、不促銷、不留電話／LINE，也不要系統測試句',
    ],
    kusoExamples: [
      '洗標密密麻麻，櫃台每天都在當外星文翻譯。',
      '羽絨被洗完膨脹到差點要跟它分房睡。',
      '梅雨季衣服比人還潮，我懷疑它在家裡開過泳池。',
    ],
    donts: ['放連結', '講優惠折扣', '叫人私訊／加 LINE', '系統測試句', '說教糾正對方'],
  },
  taskgo: {
    persona: '帶工班的頭，講話短、江湖味、帶工地幽默。',
    logic: [
      '先接現場痛：排班、殺價、順便、LINE 群考古',
      '用一句工地觀察接話，不要估價、不要叫人私訊',
      'KUSO 可以吐槽奪命 call，不要人身攻擊',
    ],
    kusoExamples: [
      '業主說順便，通常後面還有三個順便。',
      '白板排班被雨打掉那天，我才知道字是寫給天看的。',
    ],
    donts: ['放連結', '報價促銷', '人身攻擊', '系統測試句'],
  },
  homigo: {
    persona: '包租代管第一線，像在租屋板幫腔，不站隊開罵。',
    logic: [
      '先同理租金、押金、修繕沒人理',
      '再補一句整理關係／紀錄的觀察，不要教人鑽漏洞',
      'KUSO 可以自嘲半夜爆管電話，不要罵死房東或房客',
    ],
    kusoExamples: [
      '押金有時候比感情還難拿回來。',
      '熱水器選在半夜爆，是它的傳統技藝。',
    ],
    donts: ['開罵站隊', '教鑽法律漏洞', '放連結聯絡方式', '系統測試句'],
  },
};

export function getThreadsReplyGuide(slug: string): ThreadsReplyGuide {
  return REPLY_GUIDES[slug] ?? {
    persona: '品牌第一線人員，用客戶每天真正關心的話題回覆。',
    logic: ['先同理再補充', '不放連結、不促銷', '可以輕鬆，不要嘲諷對方'],
    kusoExamples: [],
    donts: ['放連結', '優惠促銷', '系統測試句'],
  };
}

export async function generateThreadsReplyDrafts(env: Env, params: {
  brandSlug: string;
  brandName: string;
  postText: string;
  username?: string | null;
  keyword?: string;
}): Promise<{ logic: string; drafts: ThreadsReplyDraft[] }> {
  const voice = getBrandVoice(params.brandSlug);
  const guide = getThreadsReplyGuide(params.brandSlug);
  const post = params.postText.trim().slice(0, 500);
  if (post.length < 8) throw new Error('原文太短，無法產回覆');

  const raw = await chatCompleteJson<{ logic?: string; drafts?: Array<{ label?: string; text?: string; why?: string }> }>(env, {
    temperature: 0.95,
    messages: [
      {
        role: 'system',
        content: [
          `你是品牌「${params.brandName}」的第一線人員,正在 Threads 用個人身分留言聊天。${voice.frontlinePersona}`,
          voice.replyCraft ?? '',
          ANTI_AI_RULES,
          '這是留言不是貼文:禁止放電話、Email、LINE、官網、匠管聯絡方式。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `對方帳號:@${params.username ?? '匿名'}`,
          params.keyword ? `搜尋關鍵字:${params.keyword}` : '',
          `原文:\n${post}`,
          '',
          '請依這則原文產 2 則可直接貼上的回覆草稿。',
          `品牌回覆邏輯:${guide.logic.join('；')}`,
          `KUSO 參考(學語氣,不要整句複製):${guide.kusoExamples.join('／') || '輕鬆接梗,自嘲自己的工作'}`,
          '',
          '鐵則:',
          '1. 兩則都要回這則原文的具體內容,不要空泛打氣。',
          '2. drafts[0] label 用「親切」,30-90 字,先同理再補一句現場觀察。',
          '3. drafts[1] label 用「KUSO」,30-90 字,台灣網路口吻、可諧音或輕吐槽自己的班表;不要嘲諷對方、不要髒話。',
          '4. 不放連結、不促銷、不叫人私訊。why 各 20 字內,說明為什麼符合品牌邏輯。',
          '5. logic 用 40-80 字,寫給小編看:這則原文踩到什麼痛、為什麼這樣回。',
          '',
          '回傳 JSON:{"logic":"...","drafts":[{"label":"親切","text":"...","why":"..."},{"label":"KUSO","text":"...","why":"..."}]}',
        ].filter(Boolean).join('\n'),
      },
    ],
  });

  const drafts = (raw.drafts ?? [])
    .map((d) => ({
      label: (d.label ?? '').trim() || '草稿',
      text: (d.text ?? '').trim(),
      why: (d.why ?? '').trim(),
    }))
    .filter((d) => d.text && !replyTextIssue(d.text));

  if (!drafts.length) throw new Error('AI 產的回覆沒通過安全檢查,請再試一次');
  return {
    logic: (raw.logic ?? '').trim() || '先同理對方的煩惱,再用第一線語氣接話。',
    drafts,
  };
}

export interface PublishReplyResult {
  ok: boolean;
  /** 被安全閘門擋下(不算失敗,留在待審佇列) */
  blocked?: boolean;
  error?: string;
  replyPostId?: string;
  replyPermalink?: string | null;
}

/**
 * 發布一則佇列中的回覆並更新狀態。
 * 成功 → status=replied;失敗 → status=failed + error_message。
 */
export async function publishReplyTarget(
  env: Env,
  params: {
    targetId: string;
    account?: ThreadsAccount | null;   // 已取得的帳號可直接傳入,省一次查詢
    reviewedByUserId?: string | null;  // 人工核准時記錄審核者
    replyTextOverride?: string;        // 人工編輯後的回覆文字
  },
): Promise<PublishReplyResult> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, brand_id, target_post_id, target_username, reply_text, status, generated_by_agent_id
    FROM threads_reply_targets
    WHERE id = ${params.targetId}::uuid
    LIMIT 1
  `;
  if (!rows.length) return { ok: false, error: '找不到回覆目標' };
  const row = rows[0] as {
    id: string; brand_id: string; target_post_id: string; target_username: string | null;
    reply_text: string | null; status: string; generated_by_agent_id: string | null;
  };
  if (row.status === 'replied') return { ok: false, error: '這則已經回覆過了' };

  const replyText = (params.replyTextOverride ?? row.reply_text ?? '').trim();
  const issue = replyTextIssue(replyText);
  if (issue) return { ok: false, error: issue };

  const account = params.account ?? await getThreadsAccount(env, row.brand_id);
  if (!account) return { ok: false, error: '品牌尚未連接 Threads 帳號' };

  try {
    const published = await replyToThreadsPost(account, {
      text: replyText, replyToId: row.target_post_id, targetUsername: row.target_username,
    });
    await sql`
      UPDATE threads_reply_targets SET
        status = 'replied',
        reply_text = ${replyText},
        reply_post_id = ${published.postId},
        reply_permalink = ${published.permalink},
        replied_at = now(),
        reviewed_by_user_id = ${params.reviewedByUserId ?? null},
        error_message = NULL
      WHERE id = ${row.id}::uuid
    `;
    try {
      await sql`UPDATE threads_reply_targets SET social_account_id = ${account.accountId}::uuid WHERE id = ${row.id}::uuid`;
    } catch { /* 057 migration 前沒有這個欄位 */ }
    await logActivity(env, {
      brandId: row.brand_id,
      actorType: params.reviewedByUserId ? 'user' : 'ai_agent',
      actorUserId: params.reviewedByUserId ?? null,
      actorAgentId: params.reviewedByUserId ? null : row.generated_by_agent_id,
      action: 'threads_reply.published',
      entityType: 'threads_reply_target',
      entityId: row.id,
      afterState: { targetPostId: row.target_post_id, targetUsername: row.target_username, permalink: published.permalink },
    });
    return { ok: true, replyPostId: published.postId, replyPermalink: published.permalink };
  } catch (e) {
    const message = e instanceof Error ? e.message : '發布失敗';
    if (isThreadsSafetyBlocked(e)) {
      await sql`
        UPDATE threads_reply_targets
        SET status = CASE WHEN status = 'approved' THEN 'pending' ELSE status END,
            error_message = ${message.slice(0, 500)}
        WHERE id = ${row.id}::uuid
      `;
      return { ok: false, blocked: true, error: message };
    }
    await sql`
      UPDATE threads_reply_targets SET status = 'failed', error_message = ${message.slice(0, 500)}
      WHERE id = ${row.id}::uuid
    `;
    return { ok: false, error: message };
  }
}
