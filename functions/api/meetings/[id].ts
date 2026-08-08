import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel, rowToCamel } from '../../_shared/case';
import { logActivity } from '../../_shared/activity';
import { json, error } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const meetingId = context.params.id as string;
  const sql = getSql(context.env);

  const meetingRows = await sql`SELECT * FROM meetings WHERE id = ${meetingId}::uuid LIMIT 1`;
  if (!meetingRows.length) return error('Meeting not found', 404);

  const meeting = rowsToCamel(meetingRows as Record<string, unknown>[])[0];
  const [messages, summaries, participants] = await Promise.all([
    sql`SELECT * FROM meeting_messages WHERE meeting_id = ${meetingId}::uuid ORDER BY created_at`,
    sql`SELECT * FROM meeting_summaries WHERE meeting_id = ${meetingId}::uuid ORDER BY created_at DESC LIMIT 1`,
    sql`SELECT participant_type, user_id, agent_id FROM meeting_participants WHERE meeting_id = ${meetingId}::uuid`,
  ]);

  const agentIds: string[] = [];
  const userIds: string[] = [];
  for (const p of participants as { participant_type: string; user_id: string | null; agent_id: string | null }[]) {
    if (p.participant_type === 'ai_agent' && p.agent_id) agentIds.push(p.agent_id);
    if (p.participant_type === 'user' && p.user_id) userIds.push(p.user_id);
  }

  const summaryRow = (summaries as Record<string, unknown>[])[0];

  return json({
    meeting: { ...meeting, participantAgentIds: agentIds, participantUserIds: userIds },
    messages: rowsToCamel(messages as Record<string, unknown>[]),
    summary: summaryRow ? {
      meetingId,
      summaryMarkdown: summaryRow.summary_markdown,
      generatedByAgentId: summaryRow.generated_by_agent_id,
    } : null,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const meetingId = context.params.id as string;
  const body = await context.request.json() as { content?: string };
  if (!body.content?.trim()) return error('content is required', 400);

  const sql = getSql(context.env);
  const meetingRows = await sql`SELECT brand_id, mode FROM meetings WHERE id = ${meetingId}::uuid LIMIT 1`;
  if (!meetingRows.length) return error('Meeting not found', 404);
  const meetingMode = (meetingRows[0] as { mode?: string }).mode ?? 'standard';

  const inserted = await sql`
    INSERT INTO meeting_messages (meeting_id, sender_type, sender_user_id, content)
    VALUES (${meetingId}::uuid, 'user', ${auth.id}::uuid, ${body.content.trim()})
    RETURNING *
  `;

  await logActivity(context.env, {
    brandId: (meetingRows[0] as { brand_id: string | null }).brand_id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'meeting.message.created',
    entityType: 'meeting_message',
    entityId: (inserted[0] as { id: string }).id,
  });

  // 管理者發言後,讓與會的 AI Agent 依序回覆一輪
  // live_editors 模式不在這裡回覆:插話會被下一次 advance 的小編看到並回應
  let aiReplies = 0;
  let aiError: string | null = null;
  if (meetingMode !== 'live_editors' && context.env.OPENAI_API_KEY) {
    try {
      const { runAgentRound } = await import('../../_shared/meeting-ai');
      const ids = await runAgentRound(context.env, meetingId);
      aiReplies = ids.length;
    } catch (e) {
      aiError = e instanceof Error ? e.message : 'AI 回覆失敗';
    }
  }

  return json({ message: rowToCamel(inserted[0] as Record<string, unknown>), aiReplies, aiError }, 201);
};
