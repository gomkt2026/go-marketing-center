import type { Env } from './env';
import { getSql } from './db';
import { getThreadsAccount, THREADS_API } from './threads';
import { getMetaAccount, resolvePageToken } from './meta';

const GRAPH_API = 'https://graph.facebook.com/v21.0';
const LOOKBACK_DAYS = 28;

export async function ensureAudienceTable(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS audience_daily (
      brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      platform    TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'threads')),
      day         DATE NOT NULL,
      followers   INT NOT NULL DEFAULT 0,
      gained      INT NOT NULL DEFAULT 0,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand_id, platform, day)
    )
  `;
}

function taipeiDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function todayTaipei(): string {
  return taipeiDay(new Date());
}

async function readJson(url: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) {
    const message = JSON.stringify(data).slice(0, 180);
    console.error('[audience]', res.status, message);
    return null;
  }
  return data;
}

function series(data: Record<string, unknown>, name: string): Array<{ day: string; value: number }> {
  const rows = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];
  const metric = rows.find((row) => row.name === name);
  const values = Array.isArray(metric?.values) ? metric.values as Array<{ value?: number; end_time?: string }> : [];
  const out: Array<{ day: string; value: number }> = [];
  for (const item of values) {
    if (!item.end_time) continue;
    const end = new Date(item.end_time);
    if (Number.isNaN(end.getTime())) continue;
    const value = Number(item.value ?? 0);
    if (!Number.isFinite(value)) continue;
    out.push({ day: taipeiDay(new Date(end.getTime() - 1000)), value });
  }
  return out;
}

async function upsert(
  env: Env,
  brandId: string,
  platform: 'facebook' | 'instagram' | 'threads',
  rows: Array<{ day: string; followers: number; gained: number }>,
): Promise<void> {
  const sql = getSql(env);
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day)) continue;
    await sql`
      INSERT INTO audience_daily (brand_id, platform, day, followers, gained)
      VALUES (
        ${brandId}::uuid, ${platform}, ${row.day}::date,
        ${Math.max(0, Math.round(row.followers))},
        ${Math.max(0, Math.round(row.gained))}
      )
      ON CONFLICT (brand_id, platform, day) DO UPDATE SET
        followers = EXCLUDED.followers,
        gained = EXCLUDED.gained,
        captured_at = now()
    `;
  }
}

async function captureThreads(env: Env, brandId: string): Promise<void> {
  const account = await getThreadsAccount(env, brandId);
  if (!account) return;
  const params = new URLSearchParams({ metric: 'followers_count', access_token: account.accessToken });
  const data = await readJson(`${THREADS_API}/${encodeURIComponent(account.threadsUserId)}/threads_insights?${params}`);
  if (!data) return;
  const rows = Array.isArray(data.data) ? data.data as Array<Record<string, unknown>> : [];
  const metric = rows.find((row) => row.name === 'followers_count');
  const totalValue = metric?.total_value as { value?: number } | undefined;
  const values = Array.isArray(metric?.values) ? metric.values as Array<{ value?: number }> : [];
  const total = Number(totalValue?.value ?? values[0]?.value ?? 0);
  if (!Number.isFinite(total) || total <= 0) return;
  const day = todayTaipei();
  const sql = getSql(env);
  const prev = await sql`
    SELECT followers FROM audience_daily
    WHERE brand_id = ${brandId}::uuid AND platform = 'threads' AND day < ${day}::date
    ORDER BY day DESC
    LIMIT 1
  `;
  const before = prev.length ? Number((prev[0] as { followers: number }).followers) : 0;
  const gained = before > 0 ? Math.max(0, Math.round(total - before)) : 0;
  await upsert(env, brandId, 'threads', [{ day, followers: total, gained }]);
}

async function captureFacebook(env: Env, brandId: string): Promise<void> {
  const account = await getMetaAccount(env, brandId, 'facebook');
  if (!account) return;
  const token = await resolvePageToken(account);
  const until = Math.floor(Date.now() / 1000);
  const since = until - LOOKBACK_DAYS * 86400;
  for (const metric of ['page_daily_follows', 'page_fan_adds']) {
    const params = new URLSearchParams({
      metric,
      period: 'day',
      since: String(since),
      until: String(until),
      access_token: token,
    });
    const data = await readJson(`${GRAPH_API}/${encodeURIComponent(account.externalId)}/insights?${params}`);
    if (!data) continue;
    const gained = series(data, metric);
    if (!gained.length) continue;
    await upsert(env, brandId, 'facebook', gained.map((row) => ({ day: row.day, followers: 0, gained: row.value })));
    return;
  }
}

async function captureInstagram(env: Env, brandId: string): Promise<void> {
  const account = await getMetaAccount(env, brandId, 'instagram');
  if (!account) return;
  const until = Math.floor(Date.now() / 1000);
  const since = until - LOOKBACK_DAYS * 86400;
  const params = new URLSearchParams({
    metric: 'follower_count',
    period: 'day',
    since: String(since),
    until: String(until),
    access_token: account.accessToken,
  });
  const data = await readJson(`${GRAPH_API}/${encodeURIComponent(account.externalId)}/insights?${params}`);
  if (!data) return;
  const totals = series(data, 'follower_count').sort((a, b) => a.day.localeCompare(b.day));
  const rows = totals.map((row, index) => {
    const prev = index > 0 ? totals[index - 1].value : row.value;
    return { day: row.day, followers: row.value, gained: Math.max(0, row.value - prev) };
  });
  await upsert(env, brandId, 'instagram', rows);
}

/** 每小時跟成效一起跑。失敗只記 log，不擋住瀏覽數回收。 */
export async function captureAudience(env: Env): Promise<void> {
  try {
    await ensureAudienceTable(env);
  } catch (e) {
    console.error('[audience] 建表失敗', e);
    return;
  }
  const sql = getSql(env);
  const brands = await sql`
    SELECT id FROM brands
    WHERE is_active = true AND lower(slug) IN ('taskgo', 'homigo', 'washgo')
  `;
  for (const brand of brands as Array<{ id: string }>) {
    await captureThreads(env, brand.id).catch((e) => console.error('[audience] threads', brand.id, e));
    await captureFacebook(env, brand.id).catch((e) => console.error('[audience] facebook', brand.id, e));
    await captureInstagram(env, brand.id).catch((e) => console.error('[audience] instagram', brand.id, e));
  }
}
