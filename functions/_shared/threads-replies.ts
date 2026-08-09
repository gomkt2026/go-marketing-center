import type { Env } from './env';
import { getSql } from './db';
import { getThreadsAccount, replyToThreadsPost, type ThreadsAccount } from './threads';
import { logActivity } from './activity';

// ============================================================================
// Threads 熱門貼文回覆佇列:共用的安全檢查與發布邏輯
//   (scheduler 自動發布與前台人工核准共用)
// ============================================================================

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
