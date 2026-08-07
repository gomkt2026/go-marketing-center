import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const meetingRows = await sql`SELECT * FROM meetings ORDER BY created_at DESC`;

  const meetings = [];
  for (const row of meetingRows as Record<string, unknown>[]) {
    const m = rowsToCamel([row])[0] as Record<string, unknown>;
    const participants = await sql`
      SELECT participant_type, user_id, agent_id FROM meeting_participants WHERE meeting_id = ${m.id}::uuid
    `;
    const agentIds: string[] = [];
    const userIds: string[] = [];
    for (const p of participants as { participant_type: string; user_id: string | null; agent_id: string | null }[]) {
      if (p.participant_type === 'ai_agent' && p.agent_id) agentIds.push(p.agent_id);
      if (p.participant_type === 'user' && p.user_id) userIds.push(p.user_id);
    }
    meetings.push({ ...m, participantAgentIds: agentIds, participantUserIds: userIds });
  }

  return json({ meetings });
};
