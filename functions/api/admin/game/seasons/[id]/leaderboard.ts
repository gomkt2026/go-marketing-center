import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { json, error } from '../../../../../_shared/response';
import { decryptPhone, getSeason, loadLeaderboard, withGameSchema } from '../../../../../_shared/game';

/** 後台完整排名：含完整手機與得獎標記。id 為 all 時是總榜。 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);
  const id = context.params.id as string;
  const seasonId = id === 'all' ? null : id;
  const season = seasonId ? await getSeason(context.env, seasonId) : null;
  if (seasonId && !season) return error('找不到賽季', 404);

  const rows = await loadLeaderboard(context.env, seasonId, 500, true);
  const sql = getSql(context.env);
  const winnerRows = seasonId
    ? await withGameSchema(context.env, () => sql`
      SELECT player_id, note FROM game_winners WHERE season_id = ${seasonId}::uuid
    `)
    : [];
  const winners = new Map((winnerRows as { player_id: string; note: string }[]).map((w) => [w.player_id, w.note]));

  const entries = await Promise.all(rows.map(async (r, i) => ({
    rank: i + 1,
    playerId: r.playerId,
    nickname: r.nickname,
    phone: await decryptPhone(context.env, r.phoneEnc),
    score: r.score,
    plays: r.plays,
    isBlocked: r.isBlocked,
    achievedAt: r.achievedAt,
    isWinner: winners.has(r.playerId),
    winnerNote: winners.get(r.playerId) ?? '',
  })));
  return json({ season, entries });
};
