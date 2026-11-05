import type { Env } from './env';
import type { AuthUser } from './auth';
import { getAuthUserById } from './auth';
import { getSql } from './db';

export interface McpKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface McpPrincipal {
  keyId: string;
  user: AuthUser;
}

const RATE_LIMIT = 60;
let tablesReady = false;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateMcpToken(): string {
  return `gmc_${bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export async function ensureMcpTables(env: Env): Promise<void> {
  if (tablesReady) return;
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS mcp_api_keys (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      key_hash     TEXT NOT NULL UNIQUE,
      key_prefix   TEXT NOT NULL,
      last_used_at TIMESTAMPTZ,
      revoked_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_user
    ON mcp_api_keys (user_id, created_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS mcp_tool_calls (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      key_id     UUID NOT NULL REFERENCES mcp_api_keys(id) ON DELETE CASCADE,
      tool_name  TEXT NOT NULL,
      brand_slug TEXT,
      ok         BOOLEAN NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_key_time
    ON mcp_tool_calls (key_id, created_at DESC)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS mcp_upload_tokens (
      token_hash TEXT PRIMARY KEY,
      key_id     UUID NOT NULL REFERENCES mcp_api_keys(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      caption    TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  tablesReady = true;
}

function mapKey(row: Record<string, unknown>): McpKeyRow {
  return {
    id: String(row.id),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    revokedAt: row.revoked_at ? String(row.revoked_at) : null,
    createdAt: String(row.created_at),
  };
}

export async function listMcpKeys(env: Env, userId: string): Promise<McpKeyRow[]> {
  await ensureMcpTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, name, key_prefix, last_used_at, revoked_at, created_at
    FROM mcp_api_keys
    WHERE user_id = ${userId}::uuid
    ORDER BY created_at DESC
    LIMIT 30
  `;
  return (rows as Record<string, unknown>[]).map(mapKey);
}

export async function createMcpKey(env: Env, userId: string, name: string): Promise<{ token: string; key: McpKeyRow }> {
  await ensureMcpTables(env);
  const token = generateMcpToken();
  const keyHash = await hashToken(token);
  const keyPrefix = token.slice(0, 12);
  const label = name.trim().slice(0, 40) || '我的連接器';
  const sql = getSql(env);
  const rows = await sql`
    INSERT INTO mcp_api_keys (user_id, name, key_hash, key_prefix)
    VALUES (${userId}::uuid, ${label}, ${keyHash}, ${keyPrefix})
    RETURNING id, name, key_prefix, last_used_at, revoked_at, created_at
  `;
  return { token, key: mapKey(rows[0] as Record<string, unknown>) };
}

export async function revokeMcpKey(env: Env, userId: string, keyId: string): Promise<boolean> {
  await ensureMcpTables(env);
  const sql = getSql(env);
  const rows = await sql`
    UPDATE mcp_api_keys
    SET revoked_at = now()
    WHERE id = ${keyId}::uuid AND user_id = ${userId}::uuid AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export function readMcpToken(request: Request): string | null {
  const header = request.headers.get('x-api-key')?.trim();
  if (header) return header;
  const auth = request.headers.get('authorization') ?? '';
  const match = auth.match(/^Bearer\s+(\S+)/i);
  return match?.[1]?.trim() || null;
}

export async function authenticateMcp(env: Env, token: string | null): Promise<McpPrincipal | null> {
  if (!token?.startsWith('gmc_')) return null;
  await ensureMcpTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, user_id FROM mcp_api_keys
    WHERE key_hash = ${await hashToken(token)} AND revoked_at IS NULL
    LIMIT 1
  `;
  const row = rows[0] as { id: string; user_id: string } | undefined;
  if (!row) return null;
  const user = await getAuthUserById(env, row.user_id);
  if (!user) return null;
  return { keyId: row.id, user };
}

export async function touchMcpKey(env: Env, keyId: string): Promise<void> {
  const sql = getSql(env);
  await sql`UPDATE mcp_api_keys SET last_used_at = now() WHERE id = ${keyId}::uuid`;
}

export async function allowMcpCall(env: Env, keyId: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60_000);
  if (env.CACHE) {
    const kvKey = `mcp:rl:${keyId}:${bucket}`;
    const current = Number(await env.CACHE.get(kvKey) ?? '0');
    if (current >= RATE_LIMIT) return false;
    await env.CACHE.put(kvKey, String(current + 1), { expirationTtl: 120 });
    return true;
  }
  const sql = getSql(env);
  const rows = await sql`
    SELECT count(*)::int AS n FROM mcp_tool_calls
    WHERE key_id = ${keyId}::uuid AND created_at > now() - interval '1 minute'
  `;
  return Number((rows[0] as { n?: number } | undefined)?.n ?? 0) < RATE_LIMIT;
}

export async function logMcpCall(
  env: Env,
  keyId: string,
  toolName: string,
  brandSlug: string | null,
  ok: boolean,
): Promise<void> {
  try {
    const sql = getSql(env);
    await sql`
      INSERT INTO mcp_tool_calls (key_id, tool_name, brand_slug, ok)
      VALUES (${keyId}::uuid, ${toolName.slice(0, 80)}, ${brandSlug}, ${ok})
    `;
  } catch (e) {
    console.error('[mcp] 呼叫紀錄寫入失敗', e);
  }
}
