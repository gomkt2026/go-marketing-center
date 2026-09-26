import type { Env } from './env';
import { getSessionSecret } from './env';
import { THREADS_OAUTH_SCOPES } from './threads';

// ============================================================================
// Threads OAuth(授權碼流程)
//   1. start:簽 state → 導向 threads.net/oauth/authorize
//   2. callback:驗 state → code 換短效 token → th_exchange_token 換 60 天長效 token
//   文件:https://developers.facebook.com/docs/threads/get-started/get-access-tokens-and-permissions
// ============================================================================

const AUTHORIZE_URL = 'https://threads.net/oauth/authorize';
const TOKEN_URL = 'https://graph.threads.net/oauth/access_token';
const EXCHANGE_URL = 'https://graph.threads.net/access_token';
const STATE_TTL_MS = 15 * 60 * 1000;

export function threadsOAuthConfigured(env: Env): boolean {
  return !!(env.THREADS_APP_ID && env.THREADS_APP_SECRET);
}

export function threadsRedirectUri(env: Env, requestUrl: string): string {
  if (env.THREADS_OAUTH_REDIRECT) return env.THREADS_OAUTH_REDIRECT;
  const base = (env.PUBLIC_BASE_URL ?? new URL(requestUrl).origin).replace(/\/+$/, '');
  return `${base}/api/threads-oauth/callback`;
}

export interface ThreadsOAuthState {
  brandId: string;
  slug: string;
  userId: string;
  nonce: string;
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str: string): Uint8Array {
  const binary = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmac(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(`${getSessionSecret(env)}:threads-oauth-state`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))));
}

export async function signOAuthState(env: Env, state: Omit<ThreadsOAuthState, 'nonce' | 'exp'>): Promise<string> {
  const payload: ThreadsOAuthState = {
    ...state,
    nonce: b64url(crypto.getRandomValues(new Uint8Array(12))),
    exp: Date.now() + STATE_TTL_MS,
  };
  const data = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${data}.${await hmac(env, data)}`;
}

export async function verifyOAuthState(env: Env, raw: string): Promise<ThreadsOAuthState | null> {
  const [data, sig] = raw.split('.');
  if (!data || !sig) return null;
  const expected = await hmac(env, data);
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(data))) as ThreadsOAuthState;
    if (!payload.brandId || !payload.userId || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(env: Env, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env.THREADS_APP_ID ?? '',
    redirect_uri: redirectUri,
    scope: THREADS_OAUTH_SCOPES.join(','),
    response_type: 'code',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; error_message?: string };
    if (typeof parsed.error === 'object' && parsed.error?.message) return parsed.error.message;
    if (parsed.error_message) return parsed.error_message;
  } catch { /* 不是 JSON */ }
  return text.slice(0, 200) || res.statusText;
}

/** code → 短效 token → 60 天長效 token */
export async function exchangeThreadsCode(env: Env, code: string, redirectUri: string): Promise<{
  accessToken: string; userId: string | null; expiresAt: string | null;
}> {
  const shortRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.THREADS_APP_ID ?? '',
      client_secret: env.THREADS_APP_SECRET ?? '',
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }).toString(),
  });
  if (!shortRes.ok) throw new Error(`授權碼換 token 失敗:${await readError(shortRes)}`);
  const short = await shortRes.json() as { access_token: string; user_id?: string | number };

  const longParams = new URLSearchParams({
    grant_type: 'th_exchange_token',
    client_secret: env.THREADS_APP_SECRET ?? '',
    access_token: short.access_token,
  });
  const longRes = await fetch(`${EXCHANGE_URL}?${longParams.toString()}`);
  if (!longRes.ok) throw new Error(`換長效 token 失敗:${await readError(longRes)}`);
  const long = await longRes.json() as { access_token: string; expires_in?: number };

  return {
    accessToken: long.access_token,
    userId: short.user_id != null ? String(short.user_id) : null,
    expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
  };
}
