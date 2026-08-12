import type { Env } from './env';
import { getSql } from './db';

export async function logActivity(
  env: Env,
  params: {
    brandId?: string | null;
    collaborationId?: string | null;
    actorType: 'user' | 'ai_agent';
    actorUserId?: string | null;
    actorAgentId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    beforeState?: unknown;
    afterState?: unknown;
  },
): Promise<void> {
  const sql = getSql(env);
  await sql`
    INSERT INTO activity_logs (
      brand_id, collaboration_id, actor_type, actor_user_id, actor_agent_id,
      action, entity_type, entity_id, before_state, after_state
    ) VALUES (
      ${params.brandId ?? null},
      ${params.collaborationId ?? null},
      ${params.actorType},
      ${params.actorUserId ?? null},
      ${params.actorAgentId ?? null},
      ${params.action},
      ${params.entityType},
      ${params.entityId ?? null},
      ${params.beforeState ? JSON.stringify(params.beforeState) : null},
      ${params.afterState ? JSON.stringify(params.afterState) : null}
    )
  `;
}

export const ACTION_LABELS: Record<string, string> = {
  'market_signal.discovered': '發現市場情報',
  'market_signal.updated': '更新市場情報狀態',
  'proposal.created': '建立提案',
  'decision.approved': '批准決策',
  'decision.rejected': '否決提案',
  'decision.returned': '退回討論',
  'content.reviewed': '審閱內容(要求修改)',
  'content.approved': '核准內容',
  'content.generated': '生成內容草稿',
  'content.rejected': '退回內容',
  'publishing.published': '發布內容',
  'brand_version.published': '發布品牌版本',
  'brand_rule.created': '新增品牌規則',
  'brand_rule.updated': '更新品牌規則',
  'brand_rule.deleted': '刪除品牌規則',
  'meeting.message.created': '新增會議訊息',
  'campaign.created': '建立行銷活動',
  'event.created': '建立活動',
  'event.updated': '更新活動設定',
  'event.registration.created': '活動報名',
  'event.checked_in': '活動報到',
  'event.checkin_undo': '取消報到',
  'event.referrer.created': '新增推薦人',
  'event.referrer.updated': '更新推薦人',
  'event.referrer.deleted': '刪除推薦人',
  'social_account.updated': '更新社群帳號設定',
  'content.approved_for_publish': '核准並排入發布(生態系行程表)',
  'threads_reply.generated': '生成 Threads 熱門貼文回覆',
  'threads_reply.published': '發布 Threads 回覆',
  'threads_reply.skipped': '略過 Threads 回覆',
  'meeting.created': '建立會議',
  'meeting.concluded': '產生會議結論',
  'brand_rule.adopted': '採納會議結論為品牌規則',
  'agent.persona_updated': '更新小編人設',
  'meeting.plan_executed': '執行會議發文計畫',
};
