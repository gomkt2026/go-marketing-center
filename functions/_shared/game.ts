import type { Env } from './env';
import { getSessionSecret } from './env';
import { getSql } from './db';
import { decryptToken } from './crypto';

/** 開局後超過這個時間就不能再送成績。 */
export const GAME_MAX_RUN_MS = 30 * 60_000;

export type GameMap = 's' | 'm' | 'l' | 't';
export const GAME_MAPS: GameMap[] = ['s', 'm', 'l', 't'];

/** 每張地圖一班的秒數、分數上限與工單上限（含逾時），與遊戲內 MAPS 一致。 */
export const MAP_RULES: Record<GameMap, { seconds: number; maxScore: number; maxOrders: number }> = {
  s: { seconds: 90, maxScore: 60_000, maxOrders: 40 },
  m: { seconds: 120, maxScore: 90_000, maxOrders: 55 },
  l: { seconds: 150, maxScore: 130_000, maxOrders: 70 },
  t: { seconds: 180, maxScore: 160_000, maxOrders: 85 },
};
export const GAME_MAX_SCORE = MAP_RULES.t.maxScore;

export function isGameMap(v: unknown): v is GameMap {
  return typeof v === 'string' && (GAME_MAPS as string[]).includes(v);
}

export function toGameMap(v: unknown, fallback: GameMap = 's'): GameMap {
  return isGameMap(v) ? v : fallback;
}

/** 開局倒數與網路延遲留 5 秒，送出時至少要經過這麼久。 */
export function minRunMs(map: GameMap): number {
  return (MAP_RULES[map].seconds - 5) * 1000;
}

/** 與遊戲內 reward() 一致：單價 ×(1 + 0.4×剩餘時間比例)× 連單倍率（1–2）× 急件 1.8。 */
const BASE_PAY = { taskgo: 1200, homigo: 1500, washgo: 380 } as const;
const MAX_MULTIPLIER = 1.4 * 2;
const RUSH_EXTRA = BASE_PAY.homigo * MAX_MULTIPLIER * 0.8;
/** 遊戲內事件：三袋整車送洗 +600、臨檢通過 +200、垃圾車 +300、地標打卡 +100、闖臨檢罰單最多 -600。 */
const EVENT_PAY = { batch3: 600, lawful: 200, garbage: 300, checkin: 100, ticket: 600 } as const;
/** 突發路況：攔狗 +200、讓救護車 +100、喜糖 +66、遶境 +88、擋救護車 -200，每班各最多一次。 */
const INCIDENT_PAY = { incDog: 200, incAmbYield: 100, incCandy: 66, incBless: 88, incAmbBlock: 200 } as const;
/** 台灣地圖地標數。 */
const MAX_CHECKINS = 9;

export interface GameStats {
  taskgo: number;
  homigo: number;
  washgo: number;
  expired: number;
  maxCombo: number;
  rush: number;
  batch3: number;
  tickets: number;
  lawful: number;
  garbage: number;
  checkins: number;
  incDog: number;
  incAmbYield: number;
  incAmbBlock: number;
  incCandy: number;
  incBless: number;
}

export interface GameSeasonRow {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  prize: string;
  topN: number;
  isActive: boolean;
  prizeMap: GameMap;
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
  return /relation ["']?game_(seasons|players|runs|scores|winners|referrals)["']? does not exist/i.test(msg)
    || /column ["']?[a-z_.]*(device_id|nickname|player_id|last_seen_at|last_score|ended_at|map)["']? (of relation ["']?game_[a-z]+["']? )?does not exist/i.test(msg);
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
  await sql`ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS device_id TEXT`;
  await sql`ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS nickname TEXT`;
  await sql`ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES game_players(id) ON DELETE SET NULL`;
  await sql`ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ`;
  await sql`ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS last_score INTEGER NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_runs_live ON game_runs (last_seen_at) WHERE ended_at IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_runs_player ON game_runs (player_id) WHERE player_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_runs_device ON game_runs (device_id) WHERE device_id IS NOT NULL`;
  await sql`
    UPDATE game_runs r SET player_id = s.player_id
    FROM game_scores s WHERE s.run_id = r.id AND r.player_id IS NULL
  `;
  steps.push('game_runs.engagement');
  await sql`ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS map TEXT NOT NULL DEFAULT 's'`;
  await sql`ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS map TEXT NOT NULL DEFAULT 's'`;
  await sql`ALTER TABLE game_seasons ADD COLUMN IF NOT EXISTS prize_map TEXT NOT NULL DEFAULT 's'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_scores_season_map_score ON game_scores (season_id, map, score DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_scores_map_score ON game_scores (map, score DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS game_referrals (
      id BIGSERIAL PRIMARY KEY,
      ref_code TEXT NOT NULL,
      friend_pid TEXT NOT NULL UNIQUE,
      env TEXT,
      ip_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_game_referrals_code ON game_referrals (ref_code)`;
  steps.push('game_maps_referrals');
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
    rush: toInt(o.rush ?? 0),
    batch3: toInt(o.batch3 ?? 0),
    tickets: toInt(o.tickets ?? 0),
    lawful: toInt(o.lawful ?? 0),
    garbage: toInt(o.garbage ?? 0),
    checkins: toInt(o.checkins ?? 0),
    incDog: toInt(o.incDog ?? 0),
    incAmbYield: toInt(o.incAmbYield ?? 0),
    incAmbBlock: toInt(o.incAmbBlock ?? 0),
    incCandy: toInt(o.incCandy ?? 0),
    incBless: toInt(o.incBless ?? 0),
  };
  const counts = [
    stats.taskgo, stats.homigo, stats.washgo, stats.expired, stats.rush, stats.batch3,
    stats.tickets, stats.lawful, stats.garbage, stats.checkins,
    stats.incDog, stats.incAmbYield, stats.incAmbBlock, stats.incCandy, stats.incBless,
  ];
  if (counts.some((n) => !Number.isInteger(n) || n < 0)) return null;
  if (!Number.isFinite(stats.maxCombo) || stats.maxCombo < 1 || stats.maxCombo > 2) return null;
  return stats;
}

/** 分數必須落在這些工單與事件可能賺到的範圍內，回傳錯誤訊息或 null。 */
export function checkScorePlausible(score: number, stats: GameStats, map: GameMap): string | null {
  const rule = MAP_RULES[map];
  if (!Number.isInteger(score) || score < 0 || score > rule.maxScore) return '分數不合理';
  if (stats.incDog > 1 || stats.incCandy > 1 || stats.incBless > 1 || stats.incAmbYield + stats.incAmbBlock > 1) {
    return '事件次數不合理';
  }
  if ((score - stats.incCandy * INCIDENT_PAY.incCandy - stats.incBless * INCIDENT_PAY.incBless) % 10 !== 0) return '分數不合理';
  const orders = stats.taskgo + stats.homigo + stats.washgo;
  if (orders + stats.expired > rule.maxOrders) return '工單數不合理';
  if (stats.rush > orders || stats.batch3 * 3 > stats.washgo) return '工單數不合理';
  if (stats.tickets + stats.lawful > 1 || stats.garbage > 1) return '事件次數不合理';
  if (stats.checkins > (map === 't' ? MAX_CHECKINS : 0)) return '打卡次數不合理';
  const base = stats.taskgo * BASE_PAY.taskgo + stats.homigo * BASE_PAY.homigo + stats.washgo * BASE_PAY.washgo;
  const bonus = stats.batch3 * EVENT_PAY.batch3 + stats.lawful * EVENT_PAY.lawful
    + stats.garbage * EVENT_PAY.garbage + stats.checkins * EVENT_PAY.checkin
    + stats.incDog * INCIDENT_PAY.incDog + stats.incAmbYield * INCIDENT_PAY.incAmbYield
    + stats.incCandy * INCIDENT_PAY.incCandy + stats.incBless * INCIDENT_PAY.incBless;
  const slack = orders * 10;
  const min = base - slack - stats.tickets * EVENT_PAY.ticket - stats.incAmbBlock * INCIDENT_PAY.incAmbBlock;
  const max = base * MAX_MULTIPLIER + stats.rush * RUSH_EXTRA + bonus + slack;
  if (score < min || score > max) return '分數與工單數不符';
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
    prizeMap: toGameMap(row.prize_map),
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

/** 每位玩家在該地圖取最佳成績；同分以先達成者為先。seasonId 為 null 時是總榜。 */
export async function loadLeaderboard(
  env: Env,
  seasonId: string | null,
  map: GameMap,
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
        WHERE s.season_id = ${seasonId}::uuid AND s.map = ${map} AND (${includeBlocked}::boolean OR NOT p.is_blocked)
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
        WHERE s.map = ${map} AND (${includeBlocked}::boolean OR NOT p.is_blocked)
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

/** 暱稱規則與上榜相同；不合格就當匿名。 */
export function cleanNickname(input: unknown): string | null {
  const name = String(input ?? '').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > 12 || /https?:|www\.|<|>/i.test(name)) return null;
  return name;
}

export function cleanDeviceId(input: unknown): string | null {
  const id = String(input ?? '');
  return /^[a-z0-9-]{8,64}$/i.test(id) ? id : null;
}

/** 超過這麼久沒心跳就不算在線。 */
export const GAME_LIVE_WINDOW_SEC = 25;

export interface GameEngagement {
  live: { count: number; players: { name: string; score: number; seconds: number }[] };
  totals: { plays: number; completed: number; minutes: number; players: number; todayPlays: number };
  topPlayers: { nickname: string; phoneMasked: string; plays: number; minutes: number }[];
}

export async function loadEngagement(env: Env): Promise<GameEngagement> {
  const sql = getSql(env);
  return withGameSchema(env, async () => {
    const [live, totals, top] = await Promise.all([
      sql`
        SELECT COALESCE(p.nickname, r.nickname) AS name, r.last_score, r.started_at
        FROM game_runs r LEFT JOIN game_players p ON p.id = r.player_id
        WHERE r.ended_at IS NULL AND r.last_seen_at > now() - make_interval(secs => ${GAME_LIVE_WINDOW_SEC})
          AND (p.id IS NULL OR NOT p.is_blocked)
        ORDER BY r.last_score DESC, r.started_at ASC
      `,
      sql`
        SELECT
          COUNT(*) AS plays,
          COUNT(*) FILTER (WHERE ended_at IS NOT NULL OR submitted_at IS NOT NULL) AS completed,
          COALESCE(SUM(CASE WHEN COALESCE(ended_at, last_seen_at, submitted_at) IS NULL THEN 0
            ELSE LEAST(1800, EXTRACT(EPOCH FROM (COALESCE(ended_at, last_seen_at, submitted_at) - started_at))) END), 0) AS seconds,
          COUNT(DISTINCT COALESCE(player_id::text, device_id, ip_hash)) AS players,
          COUNT(*) FILTER (WHERE started_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei') AS today_plays
        FROM game_runs
      `,
      sql`
        SELECT p.nickname, p.phone_masked, COUNT(*) AS plays,
          COALESCE(SUM(CASE WHEN COALESCE(r.ended_at, r.last_seen_at, r.submitted_at) IS NULL THEN 0
            ELSE LEAST(1800, EXTRACT(EPOCH FROM (COALESCE(r.ended_at, r.last_seen_at, r.submitted_at) - r.started_at))) END), 0) AS seconds
        FROM game_runs r JOIN game_players p ON p.id = r.player_id
        WHERE NOT p.is_blocked
        GROUP BY p.id, p.nickname, p.phone_masked
        ORDER BY plays DESC, seconds DESC
        LIMIT 5
      `,
    ]);
    const now = Date.now();
    const liveRows = live as { name: string | null; last_score: number; started_at: string }[];
    const t = (totals[0] ?? {}) as Record<string, unknown>;
    return {
      live: {
        count: liveRows.length,
        players: liveRows.slice(0, 12).map((r) => ({
          name: r.name || '匿名師傅',
          score: Number(r.last_score) || 0,
          seconds: Math.max(0, Math.round((now - new Date(r.started_at).getTime()) / 1000)),
        })),
      },
      totals: {
        plays: Number(t.plays) || 0,
        completed: Number(t.completed) || 0,
        minutes: Math.round((Number(t.seconds) || 0) / 60),
        players: Number(t.players) || 0,
        todayPlays: Number(t.today_plays) || 0,
      },
      topPlayers: (top as Record<string, unknown>[]).map((r) => ({
        nickname: String(r.nickname),
        phoneMasked: String(r.phone_masked),
        plays: Number(r.plays),
        minutes: Math.round(Number(r.seconds) / 60),
      })),
    };
  });
}

export const leaderboardCacheKey = (seasonId: string | null, map: GameMap, limit: number) =>
  `game:board:${seasonId ?? 'all'}:${map}:${limit}`;

/** 公開排行榜的快取鍵（賽季與總榜、所有地圖、10 與 50 筆）。 */
export function allBoardCacheKeys(seasonId: string | null): string[] {
  const scopes = seasonId ? [seasonId, null] : [null];
  return scopes.flatMap((s) => GAME_MAPS.flatMap((m) => [leaderboardCacheKey(s, m, 10), leaderboardCacheKey(s, m, 50)]));
}

/** 邀請碼、玩家識別碼：遊戲在玩家瀏覽器產生的英數字。 */
export function isRefCode(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9]{8,16}$/.test(v);
}

export function isGamePid(v: unknown): v is string {
  return typeof v === 'string' && /^[a-z0-9]{12,40}$/.test(v);
}
