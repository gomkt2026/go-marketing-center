import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import {
  cleanDeviceId, cleanNickname, hashIp, hitRateLimit, signRunToken, withGameSchema,
} from '../../../_shared/game';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ipHash = await hashIp(context.env, context.request);
  if (await hitRateLimit(context.env, `start:${ipHash}`, 120, 3600)) {
    return error('開局太頻繁，請稍後再試', 429);
  }
  let body: { deviceId?: string; nickname?: string } = {};
  try {
    body = await context.request.json() as typeof body;
  } catch {
    // 舊版遊戲不帶 body
  }
  const deviceId = cleanDeviceId(body.deviceId);
  const nickname = cleanNickname(body.nickname);
  const sql = getSql(context.env);
  try {
    const rows = await withGameSchema(context.env, () => sql`
      INSERT INTO game_runs (ip_hash, device_id, nickname, last_seen_at, player_id)
      VALUES (
        ${ipHash}, ${deviceId}, ${nickname}, now(),
        (SELECT player_id FROM game_runs WHERE device_id = ${deviceId} AND player_id IS NOT NULL
         ORDER BY started_at DESC LIMIT 1)
      )
      RETURNING id
    `);
    const runId = (rows[0] as { id: string }).id;
    const token = await signRunToken(context.env, runId);
    return json({ runId, token });
  } catch (e) {
    console.error('[game/start]', e);
    return error('暫時無法開局記分', 500);
  }
};
