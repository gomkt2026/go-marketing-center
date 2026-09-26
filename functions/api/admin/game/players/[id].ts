import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { json, error } from '../../../../_shared/response';
import { cacheDelete } from '../../../../_shared/cache';
import { getCurrentSeason, leaderboardCacheKey, withGameSchema } from '../../../../_shared/game';

/** 取消或恢復玩家參賽資格（作弊處理）。 */
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);
  const id = context.params.id as string;
  let body: { isBlocked?: boolean };
  try {
    body = await context.request.json() as { isBlocked?: boolean };
  } catch {
    return error('Invalid JSON body', 400);
  }
  const sql = getSql(context.env);
  const rows = await withGameSchema(context.env, () => sql`
    UPDATE game_players SET is_blocked = ${body.isBlocked === true}, updated_at = now()
    WHERE id = ${id}::uuid RETURNING id
  `);
  if (!rows.length) return error('找不到玩家', 404);
  const season = await getCurrentSeason(context.env);
  const keys = [leaderboardCacheKey(null, 10), leaderboardCacheKey(null, 50)];
  if (season) keys.push(leaderboardCacheKey(season.id, 10), leaderboardCacheKey(season.id, 50));
  await cacheDelete(context.env, ...keys);
  return json({ ok: true });
};
