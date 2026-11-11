import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireSuperAdmin } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, failLoad } from '../../_shared/response';
import { ensureOfficeSuggestions, setOfficeAutoPublish } from '../../_shared/office-directive';
import { loadOfficeSnapshot } from '../../_shared/office-snapshot';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireSuperAdmin(context.request, context.env);
  if (auth instanceof Response) return auth;
  try {
    return json(await loadOfficeSnapshot(context.env));
  } catch (e) {
    return failLoad('行銷中心', e);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireSuperAdmin(context.request, context.env);
  if (auth instanceof Response) return auth;
  try {
    const body = await context.request.json().catch(() => ({})) as { autoPublish?: boolean; suggestion?: string; agentId?: string };
    if (typeof body.suggestion === 'string') {
      const text = body.suggestion.trim().slice(0, 400);
      if (text.length < 2 || !body.agentId) return json({ error: '請寫下要交給這位小編的建議' }, 400);
      await ensureOfficeSuggestions(context.env);
      const sql = getSql(context.env);
      const found = await sql`
        SELECT a.id
        FROM ai_agents a
        JOIN agent_roles r ON r.id = a.role_id
        WHERE a.id = ${body.agentId}::uuid
          AND a.is_active = true
          AND r.code IN ('brand_ai', 'market_analyst', 'content_strategist', 'publisher', 'podcast_producer', 'art_director', 'video_editor')
      `;
      if (!found.length) return json({ error: '找不到這位小編' }, 404);
      await sql`
        INSERT INTO office_suggestions (agent_id, user_id, body)
        VALUES (${body.agentId}::uuid, ${auth.id}::uuid, ${text})
      `;
      return json({ ok: true });
    }
    if (typeof body.autoPublish !== 'boolean') return json({ error: '需要 autoPublish' }, 400);
    await setOfficeAutoPublish(context.env, body.autoPublish);
    return json({ ok: true, autoPublish: body.autoPublish });
  } catch (e) {
    return failLoad('行銷中心開關', e);
  }
};
