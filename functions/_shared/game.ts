import type { Env } from './env';
import { getSessionSecret } from './env';
import { getSql } from './db';
import { decryptToken } from './crypto';

/** 遊戲一班 90 秒；加上倒數與網路延遲，送出時至少要經過這麼久。 */
export const GAME_MIN_RUN_MS = 85_000;
/** 開局後超過這個時間就不能再送成績。 */
export const GAME_MAX_RUN_MS = 30 * 60_000;
export const GAME_MAX_ORDERS = 40;
export const GAME_MAX_SCORE = 120_000;

/** 與遊戲內 reward() 的基本單價一致：單價 ×(1 + 0.4×剩餘時間比例)× 連單倍率（1–2）。 */
const BASE_PAY = { taskgo: 1200, homigo: 1500, washgo: 380 } as const;
const MAX_MULTIPLIER = 1.4 * 2;

export interface GameStats {
  taskgo: number;
  homigo: number;
  washgo: number;
  expired: number;
  maxCombo: number;
}

export interface GameSeasonRow {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  prize: string;
  topN: number;
  isActive: boolean;
}

export interface LeaderboardRow {
  playerId: string;
  nickname: string;
  phoneMasked: string;
  phoneEnc: string;
  score: number;
  achievedAt: string;
  plays: number;
  isBlocked: boolean;
}

export function isMissingGameSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?game_(seasons|players|runs|scores|winners)["']? does not exist/i.test(msg);
}

export async function applyGameMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  const steps: string[] = [];
  await sql`
    CREATE TABLE IF NOT EXISTS game_seasons (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      prize TEXT NOT NULL DEFAULT '',
      top_n INTEGER NOT NULL DEFAULT 10,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  steps.push('game_seasons');
  await sql`
    CREATE TABLE IF NOT EXISTS game_players (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nickname TEXT NOT NULL,
      phone_hash TEXT NOT NULL UNIQUE,
      phone_enc TEXT NOT NULL,
      phone_masked TEXT NOT NULL,
      consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_blocked BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  steps.push('game_players');
  await sql`
    CREATE TABLE IF NOT EXISTS game_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      ip_hash TEXT,
      submitted_at TIMESTAMPTZ
    )
  `;
  steps.push('game_runs');
  await sql`
    CREATE TABLE IF NOT EXISTS game_scores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id UUID NOT NULL UNIQUE REFERENCES game_runs(id) ON DELETE CASCADE,
      player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
      season_id UUID REFERENCES game_seasons(id) ON DELETE SET NULL,
      score INTEGER NOT NULL,
      stats JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  steps.push('game_scores');
  await sql`CREATE INDEX IF NOT EXISTS idx_game_scores_season_score ON game_scores (season_id, score DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_scores_player ON game_scores (player_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_runs_started ON game_runs (started_at)`;
  steps.push('indexes');
  await sql`
    CREATE TABLE IF NOT EXISTS game_winners (
      season_id UUID NOT NULL REFERENCES game_seasons(id) ON DELETE CASCADE,
      player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (season_id, player_id)
    )
  `;
  steps.push('game_winners');
  return steps;
}

/** 缺表時自動建表再重試一次。 */
export async function withGameSchema<T>(env: Env, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isMissingGameSchema(e)) throw e;
    await applyGameMigration(env);
    return run();
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(data: string, env: Env): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${getSessionSecret(env)}:game-v1`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return toBase64Url(new Uint8Array(sig));
}

export function signRunToken(env: Env, runId: string): Promise<string> {
  return hmac(`run:${runId}`, env);
}

export async function verifyRunToken(env: Env, runId: string, token: string): Promise<boolean> {
  const expected = await signRunToken(env, runId);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function hashPhone(env: Env, phone: string): Promise<string> {
  return hmac(`phone:${phone}`, env);
}

export function hashIp(env: Env, request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  return hmac(`ip:${ip}`, env);
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

/** KV 計數的簡易頻率限制；沒有 KV 時不擋。 */
export async function hitRateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  if (!env.CACHE) return false;
  const bucket = `game:rl:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  try {
    const current = Number(await env.CACHE.get(bucket)) || 0;
    if (current >= limit) return true;
    await env.CACHE.put(bucket, String(current + 1), { expirationTtl: Math.max(60, windowSec * 2) });
  } catch (e) {
    console.warn('[game] rate limit KV failed', e);
  }
  return false;
}

function toInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

export function parseGameStats(input: unknown): GameStats | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  const stats: GameStats = {
    taskgo: toInt(o.taskgo),
    homigo: toInt(o.homigo),
    washgo: toInt(o.washgo),
    expired: toInt(o.expired ?? 0),
    maxCombo: Number(o.maxCombo ?? 1),
  };
  const counts = [stats.taskgo, stats.homigo, stats.washgo, stats.expired];
  if (counts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  if (!Number.isFinite(stats.maxCombo) || stats.maxCombo < 1 || stats.maxCombo > 2) return null;
  return stats;
}

/** 分數必須落在這些工單可能賺到的範圍內，回傳錯誤訊息或 null。 */
export function checkScorePlausible(score: number, stats: GameStats): string | null {
  if (!Number.isInteger(score) || score < 0 || score > GAME_MAX_SCORE) return '分數不合理';
  if (score % 10 !== 0) return '分數不合理';
  const orders = stats.taskgo + stats.homigo + stats.washgo;
  if (orders + stats.expired > GAME_MAX_ORDERS) return '工單數不合理';
  const base = stats.taskgo * BASE_PAY.taskgo + stats.homigo * BASE_PAY.homigo + stats.washgo * BASE_PAY.washgo;
  const slack = orders * 10;
  if (score < base - slack || score > base * MAX_MULTIPLIER + slack) return '分數與工單數不符';
  if (orders > 0 && stats.maxCombo < 1.1) return '連單紀錄不合理';
  return null;
}

function mapSeason(row: Record<string, unknown>): GameSeasonRow {
  return {
    id: String(row.id),
    name: String(row.name),
    startsAt: new Date(row.starts_at as string).toISOString(),
    endsAt: new Date(row.ends_at as string).toISOString(),
    prize: String(row.prize ?? ''),
    topN: Number(row.top_n ?? 10),
    isActive: Boolean(row.is_active),
  };
}

export async function getCurrentSeason(env: Env): Promise<GameSeasonRow | null> {
  const sql = getSql(env);
  const rows = await withGameSchema(env, () => sql`
    SELECT * FROM game_seasons
    WHERE is_active AND starts_at <= now() AND ends_at > now()
    ORDER BY starts_at DESC LIMIT 1
  `);
  return rows.length ? mapSeason(rows[0] as Record<string, unknown>) : null;
}

export async function listSeasons(env: Env): Promise<GameSeasonRow[]> {
  const sql = getSql(env);
  const rows = await withGameSchema(env, () => sql`SELECT * FROM game_seasons ORDER BY starts_at DESC`);
  return (rows as Record<string, unknown>[]).map(mapSeason);
}

export async function getSeason(env: Env, id: string): Promise<GameSeasonRow | null> {
  const sql = getSql(env);
  const rows = await withGameSchema(env, () => sql`SELECT * FROM game_seasons WHERE id = ${id}::uuid LIMIT 1`);
  return rows.length ? mapSeason(rows[0] as Record<string, unknown>) : null;
}

function mapBoard(rows: Record<string, unknown>[]): LeaderboardRow[] {
  return rows.map((r) => ({
    playerId: String(r.player_id),
    nickname: String(r.nickname),
    phoneMasked: String(r.phone_masked),
    phoneEnc: String(r.phone_enc),
    score: Number(r.score),
    achievedAt: new Date(r.created_at as string).toISOString(),
    plays: Number(r.plays ?? 1),
    isBlocked: Boolean(r.is_blocked),
  }));
}

/** 每位玩家取最佳成績；同分以先達成者為先。seasonId 為 null 時是總榜。 */
export async function loadLeaderboard(
  env: Env,
  seasonId: string | null,
  limit: number,
  includeBlocked = false,
): Promise<LeaderboardRow[]> {
  const sql = getSql(env);
  const rows = await withGameSchema(env, () => (seasonId
    ? sql`
      SELECT * FROM (
        SELECT DISTINCT ON (s.player_id)
          s.player_id, p.nickname, p.phone_masked, p.phone_enc, p.is_blocked, s.score, s.created_at,
          COUNT(*) OVER (PARTITION BY s.player_id) AS plays
        FROM game_scores s JOIN game_players p ON p.id = s.player_id
        WHERE s.season_id = ${seasonId}::uuid AND (${includeBlocked}::boolean OR NOT p.is_blocked)
        ORDER BY s.player_id, s.score DESC, s.created_at ASC
      ) best
      ORDER BY score DESC, created_at ASC
      LIMIT ${limit}
    `
    : sql`
      SELECT * FROM (
        SELECT DISTINCT ON (s.player_id)
          s.player_id, p.nickname, p.phone_masked, p.phone_enc, p.is_blocked, s.score, s.created_at,
          COUNT(*) OVER (PARTITION BY s.player_id) AS plays
        FROM game_scores s JOIN game_players p ON p.id = s.player_id
        WHERE ${includeBlocked}::boolean OR NOT p.is_blocked
        ORDER BY s.player_id, s.score DESC, s.created_at ASC
      ) best
      ORDER BY score DESC, created_at ASC
      LIMIT ${limit}
    `));
  return mapBoard(rows as Record<string, unknown>[]);
}

export async function decryptPhone(env: Env, phoneEnc: string): Promise<string> {
  try {
    return await decryptToken(env, phoneEnc);
  } catch {
    return '';
  }
}

export const leaderboardCacheKey = (seasonId: string | null, limit: number) => `game:board:${seasonId ?? 'all'}:${limit}`;
