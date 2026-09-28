import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { GAME_MAX_SCORE, verifyRunToken, withGameSchema } from '../../../_shared/game';

interface PingBody {
  runId?: string;
  token?: string;
  score?: number;
  ended?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 遊玩中每 10 秒回報一次；ended=true 代表這局結束或放棄。 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: PingBody;
  try {
    body = JSON.parse(await context.request.text()) as PingBody;
  } catch {
    return error('Invalid JSON body', 400);
  }
  const runId = String(body.runId ?? '');
  const token = String(body.token ?? '');
  if (!UUID_RE.test(runId) || !token || !(await verifyRunToken(context.env, runId, token))) {
    return error('無效的開局紀錄', 400);
  }
  const score = Math.min(GAME_MAX_SCORE, Math.max(0, Math.round(Number(body.score) || 0)));
  const ended = body.ended === true;
  const sql = getSql(context.env);
  try {
    await withGameSchema(context.env, () => sql`
      UPDATE game_runs SET
        last_seen_at = now(),
        last_score = ${score},
        ended_at = CASE WHEN ${ended}::boolean THEN now() ELSE NULL END
      WHERE id = ${runId}::uuid AND ended_at IS NULL AND started_at > now() - interval '30 minutes'
    `);
    return json({ ok: true });
  } catch (e) {
    console.error('[game/heartbeat]', e);
    return error('暫時無法回報', 500);
  }
};
