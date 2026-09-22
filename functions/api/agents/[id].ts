import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';
import { logActivity } from '../../_shared/activity';
import { writeAgentPersona } from '../../_shared/agent-persona';

// 更新 Agent 人設(僅覆寫提供的欄位,avatarUrl 由頭像生成端點管理)
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const agentId = context.params.id as string;
  const body = await context.request.json().catch(() => ({})) as {
    nickname?: string;
    characterTitle?: string;
    temperament?: string;
    catchphrase?: string;
    focus?: string;
  };

  const sql = getSql(context.env);
  const rows = await sql`SELECT id, brand_id, persona FROM ai_agents WHERE id = ${agentId}::uuid LIMIT 1`;
  if (!rows.length) return error('找不到 Agent', 404);
  const agent = rows[0] as { id: string; brand_id: string | null; persona: Record<string, unknown> | null };

  const persona = { ...(agent.persona ?? {}) } as Record<string, unknown>;
  for (const key of ['nickname', 'characterTitle', 'temperament', 'catchphrase', 'focus'] as const) {
    if (body[key] !== undefined) persona[key] = body[key];
  }

  try {
    const updated = await writeAgentPersona(context.env, agentId, persona);

    if (agent.brand_id) {
      try {
        await logActivity(context.env, {
          brandId: agent.brand_id,
          actorType: 'user',
          actorUserId: auth.id,
          action: 'agent.persona_updated',
          entityType: 'ai_agent',
          entityId: agentId,
          afterState: persona,
        });
      } catch {
        // 人設已寫入,活動紀錄失敗不擋儲存
      }
    }

    const row = updated[0];
    return json({ agent: { id: row.id, displayName: row.display_name, persona: row.persona } });
  } catch (e) {
    return error(e instanceof Error ? e.message : '儲存失敗', 500);
  }
};
