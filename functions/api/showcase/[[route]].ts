import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { error, json } from '../../../_shared/response';

const PRODUCTS = ['taskgo', 'homigo', 'washgo'] as const;
type Product = (typeof PRODUCTS)[number];
const VID_RE = /^[A-Za-z0-9-]{8,64}$/;
const COMMENT_LIMIT = { perWindow: 5, windowMinutes: 10 };

let ready: Promise<void> | null = null;

function isProduct(value: unknown): value is Product {
  return typeof value === 'string' && (PRODUCTS as readonly string[]).includes(value);
}

async function sha256(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

function adminTokens(env: Env): string[] {
  return [env.ADMIN_TOKEN, env.ADMIN_PASSWORD].filter((token): token is string => !!token);
}

function isAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('authorization') || '';
  return adminTokens(env).some((token) => auth === `Bearer ${token}`);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function routeOf(params: { route?: string | string[] }): string {
  const route = params.route;
  if (Array.isArray(route)) return route.join('/');
  return route || '';
}

function stamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

async function ensureTables(env: Env): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const sql = getSql(env);
      await sql`
        CREATE TABLE IF NOT EXISTS showcase_likes (
          product text NOT NULL,
          vid text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (product, vid)
        )`;
      await sql`
        CREATE TABLE IF NOT EXISTS showcase_comments (
          id bigserial PRIMARY KEY,
          product text NOT NULL,
          vid text NOT NULL,
          name text NOT NULL DEFAULT '',
          contact text NOT NULL DEFAULT '',
          body text NOT NULL,
          ip_hash text NOT NULL DEFAULT '',
          hidden boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS idx_showcase_comments_product ON showcase_comments (product, hidden, created_at DESC)`;
      await sql`CREATE INDEX IF NOT EXISTS idx_showcase_comments_ip ON showcase_comments (ip_hash, created_at DESC)`;
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

async function likeState(env: Env, vid: string | null) {
  const sql = getSql(env);
  const counts = Object.fromEntries(PRODUCTS.map((product) => [product, 0])) as Record<Product, number>;
  const rows = await sql<{ product: string; n: number }[]>`
    SELECT product, COUNT(*)::int AS n FROM showcase_likes GROUP BY product`;
  for (const row of rows) if (isProduct(row.product)) counts[row.product] = row.n;
  const mine = Object.fromEntries(PRODUCTS.map((product) => [product, false])) as Record<Product, boolean>;
  if (vid) {
    const own = await sql<{ product: string }[]>`SELECT product FROM showcase_likes WHERE vid = ${vid}`;
    for (const row of own) if (isProduct(row.product)) mine[row.product] = true;
  }
  return { likes: counts, mine };
}

async function publicComments(env: Env, vid: string | null) {
  const sql = getSql(env);
  const rows = await sql<{ id: number | string; product: string; vid: string; name: string; body: string; created_at: string | Date }[]>`
    SELECT id, product, vid, name, body, created_at
    FROM showcase_comments
    WHERE hidden = false
    ORDER BY id DESC
    LIMIT 300`;
  return rows.map((row) => ({
    id: Number(row.id),
    product: row.product,
    name: row.name || '訪客',
    text: row.body,
    at: stamp(row.created_at),
    mine: !!vid && row.vid === vid,
  }));
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  if (!env.DATABASE_URL && !(env.USE_HYPERDRIVE === '1' && env.HYPERDRIVE?.connectionString)) {
    return error('展示書資料庫尚未設定', 500);
  }
  try {
    await ensureTables(env);
  } catch (err) {
    console.error('[showcase] schema', err);
    return error('展示書資料表還沒準備好', 500);
  }

  const route = routeOf(context.params as { route?: string | string[] });
  const url = new URL(request.url);
  const method = request.method;
  const sql = getSql(env);

  try {
    if (method === 'GET' && route === 'state') {
      const vid = url.searchParams.get('vid');
      const visitor = vid && VID_RE.test(vid) ? vid : null;
      const state = await likeState(env, visitor);
      return json({ ...state, comments: await publicComments(env, visitor) }, 200, { 'Cache-Control': 'no-store' });
    }

    if (method === 'POST' && route === 'like') {
      const body = await readBody(request);
      const vid = typeof body.vid === 'string' ? body.vid : '';
      if (!VID_RE.test(vid)) return error('訪客識別碼無效', 400);
      if (!isProduct(body.product)) return error('沒有這個系統', 400);
      const removed = await sql<{ product: string }[]>`
        DELETE FROM showcase_likes WHERE product = ${body.product} AND vid = ${vid} RETURNING product`;
      if (!removed.length) {
        await sql`INSERT INTO showcase_likes (product, vid) VALUES (${body.product}, ${vid}) ON CONFLICT DO NOTHING`;
      }
      return json(await likeState(env, vid), 200, { 'Cache-Control': 'no-store' });
    }

    if (method === 'POST' && route === 'comment') {
      const body = await readBody(request);
      if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true });
      const vid = typeof body.vid === 'string' ? body.vid : '';
      if (!VID_RE.test(vid)) return error('訪客識別碼無效', 400);
      if (!isProduct(body.product)) return error('沒有這個系統', 400);
      const text = clean(body.text, 300);
      if (!text) return error('請先輸入留言內容', 400);
      const name = clean(body.name, 20);
      const contact = clean(body.contact, 80);
      const ipHash = await sha256(`${request.headers.get('cf-connecting-ip') || ''}${env.IP_SALT || env.SESSION_SECRET || 'go-showcase'}`);
      const recent = await sql<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM showcase_comments
        WHERE ip_hash = ${ipHash}
          AND created_at > now() - interval '10 minutes'`;
      if ((recent[0]?.n ?? 0) >= COMMENT_LIMIT.perWindow) return error('留言太頻繁，請過幾分鐘再試', 429);
      await sql`
        INSERT INTO showcase_comments (product, vid, name, contact, body, ip_hash)
        VALUES (${body.product}, ${vid}, ${name}, ${contact}, ${text}, ${ipHash})`;
      return json({ ok: true, comments: await publicComments(env, vid) }, 200, { 'Cache-Control': 'no-store' });
    }

    const deleted = route.match(/^comment\/(\d+)$/);
    if (method === 'DELETE' && deleted) {
      const id = Number(deleted[1]);
      if (isAdmin(request, env)) {
        await sql`UPDATE showcase_comments SET hidden = true WHERE id = ${id}`;
        return json({ ok: true });
      }
      const body = await readBody(request);
      const vid = typeof body.vid === 'string' ? body.vid : '';
      if (!VID_RE.test(vid)) return error('只能刪除自己的留言', 403);
      const updated = await sql<{ id: number | string }[]>`
        UPDATE showcase_comments SET hidden = true WHERE id = ${id} AND vid = ${vid} RETURNING id`;
      if (!updated.length) return error('只能刪除自己的留言', 403);
      return json({ ok: true, comments: await publicComments(env, vid) }, 200, { 'Cache-Control': 'no-store' });
    }

    if (method === 'GET' && route === 'admin/comments') {
      if (!isAdmin(request, env)) return error('管理密碼不正確', 401);
      const rows = await sql<{
        id: number | string; product: string; name: string; contact: string; body: string; hidden: boolean; created_at: string | Date;
      }[]>`
        SELECT id, product, name, contact, body, hidden, created_at
        FROM showcase_comments
        ORDER BY id DESC
        LIMIT 1000`;
      const likes = await likeState(env, null);
      return json({
        likes: likes.likes,
        comments: rows.map((row) => ({
          id: Number(row.id),
          product: row.product,
          name: row.name,
          contact: row.contact,
          text: row.body,
          hidden: row.hidden ? 1 : 0,
          created_at: stamp(row.created_at).slice(0, 19).replace('T', ' '),
        })),
      }, 200, { 'Cache-Control': 'no-store' });
    }

    if (method === 'POST' && route === 'admin/restore') {
      if (!isAdmin(request, env)) return error('管理密碼不正確', 401);
      const body = await readBody(request);
      const id = Number(body.id);
      if (!Number.isFinite(id)) return error('找不到這則留言', 400);
      await sql`UPDATE showcase_comments SET hidden = false WHERE id = ${id}`;
      return json({ ok: true });
    }

    return error('找不到這個路徑', 404);
  } catch (err) {
    console.error('[showcase]', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return error(`伺服器暫時出錯：${message.slice(0, 180)}`, 500);
  }
};
