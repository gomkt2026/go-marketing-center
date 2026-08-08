import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { logActivity } from '../../_shared/activity';

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

// 建立會議:單品牌會議或三品牌發文規則討論
// crossBrand = true 時,邀請所有品牌的 brand_ai Agent 與跨品牌分析師一起討論
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const body = await context.request.json() as {
    title?: string;
    topic?: string;
    brandSlug?: string;
    crossBrand?: boolean;
    kickoff?: boolean;
  };
  if (!body.title?.trim()) return error('title is required', 400);

  const sql = getSql(context.env);
  const brandRows = await sql`SELECT id, slug FROM brands WHERE is_active = true ORDER BY name`;
  const brands = brandRows as { id: string; slug: string }[];
  if (!brands.length) return error('沒有可用品牌', 400);

  // 會議必須綁一個品牌(schema 限制);跨品牌討論以第一個品牌掛名,參與者涵蓋全部品牌 Agent
  const hostBrand = body.brandSlug ? brands.find((b) => b.slug === body.brandSlug) : brands[0];
  if (!hostBrand) return error('找不到品牌', 404);

  const meetingRows = await sql`
    INSERT INTO meetings (brand_id, title, topic, status, initiated_by_type, initiated_by_user_id)
    VALUES (${hostBrand.id}::uuid, ${body.title.trim()}, ${body.topic ?? null}, 'in_progress', 'user', ${auth.id}::uuid)
    RETURNING *
  `;
  const meetingId = (meetingRows[0] as { id: string }).id;

  // 參與者:發起人 + Agent
  await sql`
    INSERT INTO meeting_participants (meeting_id, participant_type, user_id)
    VALUES (${meetingId}::uuid, 'user', ${auth.id}::uuid)
  `;

  const agentRows = body.crossBrand
    ? await sql`
        SELECT a.id FROM ai_agents a
        JOIN agent_roles r ON r.id = a.role_id
        WHERE a.is_active = true AND (
          (a.brand_id IS NOT NULL AND r.code = 'brand_ai') OR
          (a.brand_id IS NULL AND r.code = 'market_analyst')
        )
      `
    : await sql`
        SELECT a.id FROM ai_agents a
        WHERE a.is_active = true AND a.brand_id = ${hostBrand.id}::uuid
      `;
  for (const agent of agentRows as { id: string }[]) {
    await sql`
      INSERT INTO meeting_participants (meeting_id, participant_type, agent_id)
      VALUES (${meetingId}::uuid, 'ai_agent', ${agent.id}::uuid)
    `;
  }

  await logActivity(context.env, {
    brandId: hostBrand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'meeting.created',
    entityType: 'meeting',
    entityId: meetingId,
    afterState: { title: body.title, crossBrand: !!body.crossBrand },
  });

  // kickoff:讓每個 Agent 先各自表態一輪
  let aiError: string | null = null;
  if (body.kickoff !== false && context.env.OPENAI_API_KEY) {
    try {
      const { runAgentRound } = await import('../../_shared/meeting-ai');
      await runAgentRound(context.env, meetingId);
    } catch (e) {
      aiError = e instanceof Error ? e.message : 'AI 開場失敗';
    }
  }

  return json({ meeting: rowsToCamel(meetingRows as Record<string, unknown>[])[0], aiError }, 201);
};
