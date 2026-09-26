import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { json, error } from '../../../../../_shared/response';
import { withGameSchema } from '../../../../../_shared/game';

interface WinnerBody {
  playerId?: string;
  isWinner?: boolean;
  note?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);
  const seasonId = context.params.id as string;
  let body: WinnerBody;
  try {
    body = await context.request.json() as WinnerBody;
  } catch {
    return error('Invalid JSON body', 400);
  }
  const playerId = String(body.playerId ?? '');
  if (!playerId) return error('缺少 playerId', 400);
  const sql = getSql(context.env);
  if (body.isWinner === false) {
    await withGameSchema(context.env, () => sql`
      DELETE FROM game_winners WHERE season_id = ${seasonId}::uuid AND player_id = ${playerId}::uuid
    `);
  } else {
    const note = String(body.note ?? '').trim().slice(0, 200);
    await withGameSchema(context.env, () => sql`
      INSERT INTO game_winners (season_id, player_id, note)
      VALUES (${seasonId}::uuid, ${playerId}::uuid, ${note})
      ON CONFLICT (season_id, player_id) DO UPDATE SET note = EXCLUDED.note
    `);
  }
  return json({ ok: true });
};
