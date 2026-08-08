import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { concludeMeeting } from '../../../_shared/meeting-ai';
import { logActivity } from '../../../_shared/activity';
import { getSql } from '../../../_shared/db';

// 產生會議結論:AI 摘要 + 各品牌可採納的發文規則建議
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const meetingId = context.params.id as string;
  const conclusion = await concludeMeeting(context.env, meetingId);
  if (!conclusion) return error('會議不存在或尚無對話內容', 400);

  const sql = getSql(context.env);
  const meetingRows = await sql`SELECT brand_id FROM meetings WHERE id = ${meetingId}::uuid LIMIT 1`;

  await logActivity(context.env, {
    brandId: meetingRows.length ? (meetingRows[0] as { brand_id: string | null }).brand_id : null,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'meeting.concluded',
    entityType: 'meeting',
    entityId: meetingId,
    afterState: { suggestedRules: conclusion.suggestedRules.length, postPlan: conclusion.postPlan.length },
  });

  return json({ summary: conclusion.summaryMarkdown, suggestedRules: conclusion.suggestedRules, postPlan: conclusion.postPlan });
};
