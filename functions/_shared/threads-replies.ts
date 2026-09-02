import type { Env } from './env';
import { getSql } from './db';
import { getThreadsAccount, replyToThreadsPost, type ThreadsAccount } from './threads';
import { logActivity } from './activity';

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

/** 程式層安全檢查:回傳 null 表示通過,否則回傳問題描述 */
export function replyTextIssue(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  if (t.length < 10) return '回覆內容過短';
  if (t.length > 480) return '回覆超過 Threads 長度上限';
  if (/https?:\/\/|www\.|\.com\b|\.tw\b|\.net\b/i.test(t)) return '回覆不可包含連結';
  if (/(優惠|折扣|限時|下單|購買|私訊我|加\s?line|加賴|官網|報名連結)/i.test(t)) return '回覆不可包含促銷用語';
  return null;
}

export interface PublishReplyResult {
  ok: boolean;
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
    const published = await replyToThreadsPost(account, { text: replyText, replyToId: row.target_post_id });
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
    await sql`
      UPDATE threads_reply_targets SET status = 'failed', error_message = ${message.slice(0, 500)}
      WHERE id = ${row.id}::uuid
    `;
    return { ok: false, error: message };
  }
}
