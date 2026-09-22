import type { Env } from './env';
import { getSessionSecret } from './env';
import { getSql } from './db';
import { rowToCamel } from './case';

const SESSION_COOKIE = 'gmc_session';
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export interface SessionPayload {
  userId: string;
  exp: number;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatarUrl?: string;
  brandIds: string[];
  brandSlugs: string[];
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return encodeBase64Url(new Uint8Array(sig));
}

async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const expected = await hmacSign(data, secret);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSessionToken(payload: SessionPayload, env: Env): Promise<string> {
  const data = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacSign(data, getSessionSecret(env));
  return `${data}.${sig}`;
}

export async function parseSessionToken(token: string, env: Env): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const valid = await hmacVerify(data, sig, getSessionSecret(env));
  if (!valid) return null;
  try {
    const json = new TextDecoder().decode(decodeBase64Url(data));
    const payload = JSON.parse(json) as SessionPayload;
    if (!payload.userId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieHeader(token: string, maxAge = SESSION_MAX_AGE_SEC): string {
  const secure = 'Secure; ';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; ${secure}SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getSessionTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? '';
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match?.[1] ?? null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    const inner = value.replace(/^\{|\}$/g, '').trim();
    if (!inner) return [];
    return inner.split(',').map((s) => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
  }
  return [];
}

const USER_ROW_TTL_MS = 30_000;
const userRowCache = new Map<string, { at: number; user: AuthUser | null }>();

async function loadUserRowById(env: Env, userId: string): Promise<AuthUser | null> {
  const hit = userRowCache.get(userId);
  if (hit && Date.now() - hit.at < USER_ROW_TTL_MS) return hit.user;

  const sql = getSql(env);
  const rows = await sql`
    SELECT u.id, u.email, u.display_name, u.role, u.avatar_url,
           coalesce(array_agg(b.id) FILTER (WHERE b.id IS NOT NULL), '{}'::uuid[]) AS brand_ids,
           coalesce(array_agg(b.slug) FILTER (WHERE b.slug IS NOT NULL), '{}'::text[]) AS brand_slugs
    FROM users u
    LEFT JOIN brand_members m ON m.user_id = u.id
    LEFT JOIN brands b ON b.id = m.brand_id AND b.is_active = true
    WHERE u.id = ${userId}::uuid AND u.is_active = true
    GROUP BY u.id
    LIMIT 1
  `;
  if (!rows.length) {
    userRowCache.set(userId, { at: Date.now(), user: null });
    return null;
  }
  const row = rows[0] as Record<string, unknown>;
  const user = mapUserRow(row, {
    brandIds: asStringArray(row.brand_ids),
    brandSlugs: asStringArray(row.brand_slugs),
  });
  userRowCache.set(userId, { at: Date.now(), user });
  return user;
}

function mapUserRow(row: Record<string, unknown>, memberships: { brandIds: string[]; brandSlugs: string[] }): AuthUser {
  const user = rowToCamel<AuthUser>(row);
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? (row.display_name as string),
    role: user.role,
    avatarUrl: user.avatarUrl ?? undefined,
    brandIds: memberships.brandIds,
    brandSlugs: memberships.brandSlugs,
  };
}

export function isSuperAdmin(user: AuthUser): boolean {
  return user.role === 'super_admin';
}

export function canAccessBrand(user: AuthUser, brandId: string): boolean {
  if (isSuperAdmin(user)) return true;
  return user.brandIds.includes(brandId);
}

export function canAccessBrandSlug(user: AuthUser, slug: string): boolean {
  if (isSuperAdmin(user)) return true;
  return user.brandSlugs.includes(slug);
}

export function forbidden(message = 'Forbidden'): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function requireBrandAccess(user: AuthUser, brandId: string): true | Response {
  if (canAccessBrand(user, brandId)) return true;
  return forbidden();
}

export async function getAuthUser(request: Request, env: Env): Promise<AuthUser | null> {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  const session = await parseSessionToken(token, env);
  if (!session) return null;

  return loadUserRowById(env, session.userId);
}

export async function requireAuth(request: Request, env: Env): Promise<AuthUser | Response> {
  const user = await getAuthUser(request, env);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return user;
}

export async function findAdminUser(env: Env): Promise<AuthUser | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id FROM users
    WHERE role = 'super_admin' AND is_active = true
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (!rows.length) return null;
  return loadUserRowById(env, (rows[0] as { id: string }).id);
}

export async function findUserByUsername(env: Env, username: string): Promise<(AuthUser & { passwordHash: string }) | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, email, display_name, role, avatar_url, password_hash
    FROM users
    WHERE username = ${username} AND is_active = true AND password_hash IS NOT NULL
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as Record<string, unknown>;
  const user = await loadUserRowById(env, row.id as string);
  if (!user) return null;
  return { ...user, passwordHash: row.password_hash as string };
}

export async function findUserByEmail(env: Env, email: string): Promise<AuthUser | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, email, display_name, role, avatar_url
    FROM users
    WHERE email = ${email} AND is_active = true
    LIMIT 1
  `;
  if (!rows.length) return null;
  return loadUserRowById(env, (rows[0] as { id: string }).id);
}

export { SESSION_MAX_AGE_SEC };
