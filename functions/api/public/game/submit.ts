import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { encryptToken } from '../../../_shared/crypto';
import { cacheDelete } from '../../../_shared/cache';
import { isValidTaiwanMobile, normalizePhone } from '../../../_shared/token';
import {
  GAME_MAX_RUN_MS, allBoardCacheKeys, checkScorePlausible, getCurrentSeason, hashIp, hashPhone,
  hitRateLimit, loadLeaderboard, maskPhone, minRunMs, parseGameStats, toGameMap, verifyRunToken,
  withGameSchema,
} from '../../../_shared/game';

interface SubmitBody {
  runId?: string;
  token?: string;
  score?: number;
  stats?: unknown;
  nickname?: string;
  phone?: string;
  consent?: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;
  const ipHash = await hashIp(env, request);
  if (await hitRateLimit(env, `submit:${ipHash}`, 40, 3600)) {
    return error('送出太頻繁，請稍後再試', 429);
  }

  let body: SubmitBody;
  try {
    body = await request.json() as SubmitBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const nickname = String(body.nickname ?? '').replace(/\s+/g, ' ').trim();
  const phone = normalizePhone(String(body.phone ?? ''));
  if (!nickname || [...nickname].length > 12) return error('暱稱請填 1–12 個字', 400);
  if (/https?:|www\.|<|>/i.test(nickname)) return error('暱稱不能包含網址或特殊符號', 400);
  if (!isValidTaiwanMobile(phone)) return error('請輸入有效的台灣手機號碼（09 開頭 10 碼）', 400);
  if (body.consent !== true) return error('請勾選同意個資使用說明', 400);

  const runId = String(body.runId ?? '');
  const token = String(body.token ?? '');
  if (!UUID_RE.test(runId) || !token || !(await verifyRunToken(env, runId, token))) {
    return error('這一局沒有有效的開局紀錄，請重新開一局', 400);
  }

  const stats = parseGameStats(body.stats);
  const score = Number(body.score);
  if (!stats) return error('成績資料不完整', 400);

  const sql = getSql(env);
  try {
    const runRows = await withGameSchema(env, () => sql`
      SELECT map FROM game_runs WHERE id = ${runId}::uuid AND submitted_at IS NULL
    `);
    if (!runRows.length) return error('這一局已經送出過了', 409);
    const map = toGameMap((runRows[0] as { map: string }).map);
    const implausible = checkScorePlausible(score, stats, map);
    if (implausible) return error(`成績未通過驗證：${implausible}`, 400);

    const season = await getCurrentSeason(env);

    const claimed = await sql`
      UPDATE game_runs SET submitted_at = now(), ended_at = COALESCE(ended_at, last_seen_at, now())
      WHERE id = ${runId}::uuid AND submitted_at IS NULL
      RETURNING started_at
    `;
    if (!claimed.length) return error('這一局已經送出過了', 409);
    const elapsed = Date.now() - new Date((claimed[0] as { started_at: string }).started_at).getTime();
    if (elapsed < minRunMs(map)) return error('成績未通過驗證：遊戲時間不足', 400);
    if (elapsed > GAME_MAX_RUN_MS) return error('這一局已過期，請重新開一局', 400);

    const phoneHash = await hashPhone(env, phone);
    const phoneEnc = await encryptToken(env, phone);
    const playerRows = await sql`
      INSERT INTO game_players (nickname, phone_hash, phone_enc, phone_masked)
      VALUES (${nickname}, ${phoneHash}, ${phoneEnc}, ${maskPhone(phone)})
      ON CONFLICT (phone_hash) DO UPDATE SET nickname = EXCLUDED.nickname, updated_at = now()
      RETURNING id, is_blocked
    `;
    const player = playerRows[0] as { id: string; is_blocked: boolean };
    if (player.is_blocked) return error('此手機號碼已被取消參賽資格', 403);

    await sql`
      INSERT INTO game_scores (run_id, player_id, season_id, map, score, stats)
      VALUES (${runId}::uuid, ${player.id}::uuid, ${season?.id ?? null}::uuid, ${map}, ${score}, ${JSON.stringify(stats)})
    `;

    await sql`
      UPDATE game_runs SET player_id = ${player.id}::uuid, nickname = ${nickname}
      WHERE id = ${runId}::uuid
         OR (player_id IS NULL AND device_id IS NOT NULL
             AND device_id = (SELECT device_id FROM game_runs WHERE id = ${runId}::uuid))
    `;

    const seasonId = season?.id ?? null;
    await cacheDelete(env, ...allBoardCacheKeys(seasonId));

    const board = await loadLeaderboard(env, seasonId, map, 500);
    const idx = board.findIndex((r) => r.playerId === player.id);
    const best = idx >= 0 ? board[idx].score : score;
    return json({
      ok: true,
      map,
      rank: idx >= 0 ? idx + 1 : null,
      total: board.length,
      best,
      isBest: best === score,
      isPrizeMap: season ? season.prizeMap === map : false,
      season: season ? { id: season.id, name: season.name, topN: season.topN, prizeMap: season.prizeMap } : null,
    }, 201);
  } catch (e) {
    console.error('[game/submit]', e);
    return error('成績暫時無法送出，請稍後再試', 500);
  }
};
