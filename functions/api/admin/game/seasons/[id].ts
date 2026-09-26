import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { json, error } from '../../../../_shared/response';
import { cacheDelete } from '../../../../_shared/cache';
import { leaderboardCacheKey, withGameSchema } from '../../../../_shared/game';
import { parseSeasonInput, type SeasonInput } from '../seasons';

async function bustBoard(env: Env, seasonId: string) {
  await cacheDelete(env, leaderboardCacheKey(seasonId, 10), leaderboardCacheKey(seasonId, 50),
    leaderboardCacheKey(null, 10), leaderboardCacheKey(null, 50));
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);
  const id = context.params.id as string;
  let body: SeasonInput;
  try {
    body = await context.request.json() as SeasonInput;
  } catch {
    return error('Invalid JSON body', 400);
  }
  const parsed = parseSeasonInput(body);
  if (!parsed.value) return error(parsed.error ?? '資料不正確', 400);
  const v = parsed.value;
  const sql = getSql(context.env);
  const rows = await withGameSchema(context.env, () => sql`
    UPDATE game_seasons SET
      name = ${v.name}, starts_at = ${v.startsAt}, ends_at = ${v.endsAt},
      prize = ${v.prize}, top_n = ${v.topN}, is_active = ${v.isActive}, updated_at = now()
    WHERE id = ${id}::uuid RETURNING id
  `);
  if (!rows.length) return error('找不到賽季', 404);
  await bustBoard(context.env, id);
  return json({ ok: true });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);
  const id = context.params.id as string;
  const sql = getSql(context.env);
  await withGameSchema(context.env, () => sql`DELETE FROM game_seasons WHERE id = ${id}::uuid`);
  await bustBoard(context.env, id);
  return json({ ok: true });
};
