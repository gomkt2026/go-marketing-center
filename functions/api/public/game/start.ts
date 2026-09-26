import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { hashIp, hitRateLimit, signRunToken, withGameSchema } from '../../../_shared/game';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ipHash = await hashIp(context.env, context.request);
  if (await hitRateLimit(context.env, `start:${ipHash}`, 120, 3600)) {
    return error('開局太頻繁，請稍後再試', 429);
  }
  const sql = getSql(context.env);
  try {
    const rows = await withGameSchema(context.env, () => sql`
      INSERT INTO game_runs (ip_hash) VALUES (${ipHash}) RETURNING id
    `);
    const runId = (rows[0] as { id: string }).id;
    const token = await signRunToken(context.env, runId);
    return json({ runId, token });
  } catch (e) {
    console.error('[game/start]', e);
    return error('暫時無法開局記分', 500);
  }
};
