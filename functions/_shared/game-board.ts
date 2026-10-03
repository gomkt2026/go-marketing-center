import type { Env } from './env';
import { getSql } from './db';
import { cleanNickname, hashIp, hitRateLimit, withGameSchema, type GameMap } from './game';

export const GAME_WEEK_DAYS = 7;

export type WishKind = 'feature' | 'bug' | 'cheer';
export type HeatLevel = 'hot' | 'steady' | 'cool' | 'building';

export interface GameWeekDay {
  date: string;
  label: string;
  plays: number;
  completed: number;
  players: number;
  minutes: number;
  partial: boolean;
}

export interface GameHeat {
  level: HeatLevel;
  label: string;
  detail: string;
  yesterdayPlays: number;
  baselinePlays: number;
}

export interface GameWeekPulse {
  updatedAt: string;
  days: GameWeekDay[];
  totals: {
    plays: number;
    completed: number;
    players: number;
    minutes: number;
    signups: number;
    referrals: number;
  };
  today: { plays: number; completed: number };
  heat: GameHeat;
  jobs: { taskgo: number; homigo: number; washgo: number };
  maps: Record<GameMap, number>;
}

export interface PublicWish {
  id: string;
  nickname: string;
  body: string;
  kind: WishKind;
  supports: number;
  createdAt: string;
}

const KIND_SET = new Set<WishKind>(['feature', 'bug', 'cheer']);

/** 用已結束的日子比熱度。今天還在累積，不拿來當基準。 */
export function describeHeat(plays: number[]): GameHeat {
  const series = plays.slice(-GAME_WEEK_DAYS);
  while (series.length < GAME_WEEK_DAYS) series.unshift(0);
  const yesterday = series[GAME_WEEK_DAYS - 2] ?? 0;
  const prior = series.slice(0, GAME_WEEK_DAYS - 2);
  const priorSum = prior.reduce((sum, n) => sum + n, 0);
  if (priorSum === 0) {
    return {
      level: 'building',
      label: '熱度累積中',
      detail: yesterday > 0
        ? `昨天 ${yesterday.toLocaleString('en-US')} 局，前面幾天還沒有對照，明天開始才看升溫或降溫。`
        : '這一週的對照還不夠，有人開局之後，隔天就會看出熱度。',
      yesterdayPlays: yesterday,
      baselinePlays: 0,
    };
  }
  const baseline = priorSum / prior.length;
  const delta = (yesterday - baseline) / baseline;
  const pct = Math.round(Math.abs(delta) * 100);
  const baseLabel = `前幾天每天平均 ${Math.round(baseline).toLocaleString('en-US')} 局`;
  if (delta >= 0.25) {
    return {
      level: 'hot',
      label: '熱度上升',
      detail: `昨天 ${yesterday.toLocaleString('en-US')} 局，比${baseLabel}多 ${pct}%。`,
      yesterdayPlays: yesterday,
      baselinePlays: Math.round(baseline),
    };
  }
  if (delta <= -0.25) {
    return {
      level: 'cool',
      label: '熱度下降',
      detail: `昨天 ${yesterday.toLocaleString('en-US')} 局，比${baseLabel}少 ${pct}%。`,
      yesterdayPlays: yesterday,
      baselinePlays: Math.round(baseline),
    };
  }
  return {
    level: 'steady',
    label: '熱度持平',
    detail: `昨天 ${yesterday.toLocaleString('en-US')} 局，跟${baseLabel}差不多。`,
    yesterdayPlays: yesterday,
    baselinePlays: Math.round(baseline),
  };
}

function dayLabel(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}`;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value ?? '');
  return text.slice(0, 10);
}

export async function loadWeekPulse(env: Env): Promise<GameWeekPulse> {
  const sql = getSql(env);
  return withGameSchema(env, async () => {
    const [days, totals, jobs, maps, signups, referrals] = await Promise.all([
      sql`
        WITH bounds AS (
          SELECT (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei'))::date AS today
        ),
        days AS (
          SELECT generate_series(
            (SELECT today FROM bounds) - 6,
            (SELECT today FROM bounds),
            interval '1 day'
          )::date AS day
        ),
        runs AS (
          SELECT
            (started_at AT TIME ZONE 'Asia/Taipei')::date AS day,
            COALESCE(player_id::text, device_id, ip_hash) AS who,
            (ended_at IS NOT NULL OR submitted_at IS NOT NULL) AS done,
            CASE
              WHEN COALESCE(ended_at, last_seen_at, submitted_at) IS NULL THEN 0
              ELSE LEAST(1800, EXTRACT(EPOCH FROM (COALESCE(ended_at, last_seen_at, submitted_at) - started_at)))
            END AS seconds
          FROM game_runs
          WHERE started_at >= ((SELECT today FROM bounds) - 6) AT TIME ZONE 'Asia/Taipei'
        )
        SELECT
          d.day,
          COUNT(r.day) AS plays,
          COUNT(r.day) FILTER (WHERE r.done) AS completed,
          COUNT(DISTINCT r.who) AS players,
          COALESCE(SUM(r.seconds), 0) AS seconds
        FROM days d
        LEFT JOIN runs r ON r.day = d.day
        GROUP BY d.day
        ORDER BY d.day
      `,
      sql`
        SELECT
          COUNT(DISTINCT COALESCE(player_id::text, device_id, ip_hash)) AS players
        FROM game_runs
        WHERE started_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei')::date - 6) AT TIME ZONE 'Asia/Taipei'
      `,
      sql`
        SELECT
          COALESCE(SUM(CASE WHEN (stats->>'taskgo') ~ '^[0-9]+$' THEN (stats->>'taskgo')::int ELSE 0 END), 0) AS taskgo,
          COALESCE(SUM(CASE WHEN (stats->>'homigo') ~ '^[0-9]+$' THEN (stats->>'homigo')::int ELSE 0 END), 0) AS homigo,
          COALESCE(SUM(CASE WHEN (stats->>'washgo') ~ '^[0-9]+$' THEN (stats->>'washgo')::int ELSE 0 END), 0) AS washgo
        FROM game_scores
        WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei')::date - 6) AT TIME ZONE 'Asia/Taipei'
      `,
      sql`
        SELECT map, COUNT(*) AS plays
        FROM game_runs
        WHERE started_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei')::date - 6) AT TIME ZONE 'Asia/Taipei'
        GROUP BY map
      `,
      sql`
        SELECT COUNT(*) AS n
        FROM game_players
        WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei')::date - 6) AT TIME ZONE 'Asia/Taipei'
      `,
      sql`
        SELECT COUNT(*) AS n
        FROM game_referrals
        WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei')::date - 6) AT TIME ZONE 'Asia/Taipei'
      `,
    ]);

    const dayRows = days as Record<string, unknown>[];
    const todayKey = asDate(dayRows[dayRows.length - 1]?.day);
    const pulseDays: GameWeekDay[] = dayRows.map((row) => {
      const date = asDate(row.day);
      return {
        date,
        label: dayLabel(date),
        plays: num(row.plays),
        completed: num(row.completed),
        players: num(row.players),
        minutes: Math.round(num(row.seconds) / 60),
        partial: date === todayKey,
      };
    });
    const mapCounts: Record<GameMap, number> = { s: 0, m: 0, l: 0, t: 0 };
    for (const row of maps as Record<string, unknown>[]) {
      const key = String(row.map);
      if (key === 's' || key === 'm' || key === 'l' || key === 't') mapCounts[key] = num(row.plays);
    }
    const job = (jobs[0] ?? {}) as Record<string, unknown>;
    const plays = pulseDays.map((d) => d.plays);
    const today = pulseDays[pulseDays.length - 1];
    return {
      updatedAt: new Date().toISOString(),
      days: pulseDays,
      totals: {
        plays: plays.reduce((sum, n) => sum + n, 0),
        completed: pulseDays.reduce((sum, d) => sum + d.completed, 0),
        players: num((totals[0] as Record<string, unknown> | undefined)?.players),
        minutes: pulseDays.reduce((sum, d) => sum + d.minutes, 0),
        signups: num((signups[0] as Record<string, unknown> | undefined)?.n),
        referrals: num((referrals[0] as Record<string, unknown> | undefined)?.n),
      },
      today: { plays: today?.plays ?? 0, completed: today?.completed ?? 0 },
      heat: describeHeat(plays),
      jobs: { taskgo: num(job.taskgo), homigo: num(job.homigo), washgo: num(job.washgo) },
      maps: mapCounts,
    };
  });
}

export function emptyWeekPulse(): GameWeekPulse {
  const heat = describeHeat([0, 0, 0, 0, 0, 0, 0]);
  return {
    updatedAt: new Date().toISOString(),
    days: [],
    totals: { plays: 0, completed: 0, players: 0, minutes: 0, signups: 0, referrals: 0 },
    today: { plays: 0, completed: 0 },
    heat,
    jobs: { taskgo: 0, homigo: 0, washgo: 0 },
    maps: { s: 0, m: 0, l: 0, t: 0 },
  };
}

function cleanBody(input: unknown): string | null {
  const body = String(input ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...body];
  if (chars.length < 4 || chars.length > 180) return null;
  if (/https?:|www\.|<|>|line\.me|加賴|加line/i.test(body)) return null;
  if (/(.)\1{7,}/u.test(body)) return null;
  return body;
}

export function parseWish(input: Record<string, unknown>): { ok: true; nickname: string; body: string; kind: WishKind } | { ok: false; error: string } | { ok: false; error: 'spam' } {
  if (String(input.company ?? '').trim()) return { ok: false, error: 'spam' };
  const body = cleanBody(input.body);
  if (!body) return { ok: false, error: '留言請寫 4 到 180 個字，先不要放網址' };
  const kind = KIND_SET.has(input.kind as WishKind) ? input.kind as WishKind : 'feature';
  return { ok: true, nickname: cleanNickname(input.nickname) ?? '匿名師傅', body, kind };
}

export async function listPublicWishes(env: Env): Promise<PublicWish[]> {
  const sql = getSql(env);
  return withGameSchema(env, async () => {
    const rows = await sql`
      SELECT id, nickname, body, kind, supports, created_at
      FROM game_wishes
      WHERE status = 'visible'
      ORDER BY created_at DESC
      LIMIT 60
    `;
    return (rows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      nickname: String(row.nickname),
      body: String(row.body),
      kind: (KIND_SET.has(row.kind as WishKind) ? row.kind : 'feature') as WishKind,
      supports: num(row.supports),
      createdAt: new Date(String(row.created_at)).toISOString(),
    }));
  });
}

export async function insertWish(env: Env, request: Request, wish: { nickname: string; body: string; kind: WishKind }): Promise<'ok' | 'limited'> {
  const ip = await hashIp(env, request);
  if (await hitRateLimit(env, `wish:${ip}`, 3, 3600)) return 'limited';
  const sql = getSql(env);
  return withGameSchema(env, async () => {
    const recent = await sql`
      SELECT COUNT(*) AS n FROM game_wishes
      WHERE ip_hash = ${ip} AND created_at > now() - interval '1 day'
    `;
    if (num((recent[0] as Record<string, unknown> | undefined)?.n) >= 5) return 'limited';
    const burst = await sql`
      SELECT 1 FROM game_wishes
      WHERE ip_hash = ${ip} AND created_at > now() - interval '2 minutes'
      LIMIT 1
    `;
    if (burst.length) return 'limited';
    await sql`
      INSERT INTO game_wishes (nickname, body, kind, ip_hash)
      VALUES (${wish.nickname}, ${wish.body}, ${wish.kind}, ${ip})
    `;
    return 'ok';
  });
}

export async function supportWish(env: Env, request: Request, id: string): Promise<{ supports: number } | 'limited' | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const ip = await hashIp(env, request);
  if (await hitRateLimit(env, `wish-support:${ip}`, 40, 3600)) return 'limited';
  const sql = getSql(env);
  return withGameSchema(env, async () => {
    const inserted = await sql`
      INSERT INTO game_wish_supports (wish_id, ip_hash)
      SELECT id, ${ip} FROM game_wishes WHERE id = ${id}::uuid AND status = 'visible'
      ON CONFLICT DO NOTHING
      RETURNING wish_id
    `;
    if (inserted.length) {
      await sql`UPDATE game_wishes SET supports = supports + 1 WHERE id = ${id}::uuid`;
    }
    const rows = await sql`SELECT supports FROM game_wishes WHERE id = ${id}::uuid AND status = 'visible'`;
    if (!rows.length) return null;
    return { supports: num((rows[0] as Record<string, unknown>).supports) };
  });
}
