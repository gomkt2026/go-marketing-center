import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { hashIp, hitRateLimit, isGamePid, isRefCode, withGameSchema } from '../../../_shared/game';

const ENVS = ['line', 'instagram', 'threads', 'facebook', 'mobile', 'desktop'];

/** GET ?code=邀請碼 → 這個邀請碼帶來幾位玩完一班的朋友（累積 1 位就解鎖台灣地圖）。 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const code = new URL(context.request.url).searchParams.get('code');
  if (!isRefCode(code)) return error('邀請碼格式錯誤', 400);
  const sql = getSql(context.env);
  try {
    const rows = await withGameSchema(context.env, () => sql`
      SELECT COUNT(*)::int AS n FROM game_referrals WHERE ref_code = ${code}
    `);
    return json({ code, count: (rows[0] as { n: number } | undefined)?.n ?? 0 }, 200, { 'Cache-Control': 'no-store' });
  } catch (e) {
    console.error('[game/referral]', e);
    return error('暫時無法查詢邀請紀錄', 500);
  }
};

/** POST { code, pid, env }：朋友從邀請連結玩完第一班時由遊戲回報，每位朋友只算一次。 */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const ipHash = await hashIp(context.env, context.request);
  if (await hitRateLimit(context.env, `referral:${ipHash}`, 5, 3600)) {
    return error('送出太頻繁，請稍後再試', 429);
  }
  let body: { code?: string; pid?: string; env?: string };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return error('Invalid JSON body', 400);
  }
  if (!isRefCode(body.code)) return error('邀請碼格式錯誤', 400);
  if (!isGamePid(body.pid)) return error('玩家識別碼錯誤', 400);
  const env = ENVS.includes(body.env ?? '') ? body.env! : null;
  const sql = getSql(context.env);
  try {
    await withGameSchema(context.env, () => sql`
      INSERT INTO game_referrals (ref_code, friend_pid, env, ip_hash)
      VALUES (${body.code}, ${body.pid}, ${env}, ${ipHash})
      ON CONFLICT (friend_pid) DO NOTHING
    `);
    return json({ ok: true });
  } catch (e) {
    console.error('[game/referral]', e);
    return error('暫時無法記錄邀請', 500);
  }
};
