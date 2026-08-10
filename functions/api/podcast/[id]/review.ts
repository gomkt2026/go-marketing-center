import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';

// POST /api/podcast/:id/review:內部審核(第一階段僅內部試聽,不對外發布)
//   { action: 'approve' | 'reject' | 'archive' }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const episodeId = context.params.id as string;
  const body = await context.request.json() as { action?: string };
  const statusByAction: Record<string, string> = {
    approve: 'approved',
    reject: 'rejected',
    archive: 'archived',
  };
  const nextStatus = statusByAction[body.action ?? ''];
  if (!nextStatus) return error('action 必須為 approve / reject / archive', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    UPDATE podcast_episodes
    SET status = ${nextStatus}::podcast_episode_status, updated_at = now()
    WHERE id = ${episodeId}::uuid
    RETURNING id, status
  `;
  if (!rows.length) return error('找不到這集節目', 404);
  return json({ id: episodeId, status: nextStatus });
};
