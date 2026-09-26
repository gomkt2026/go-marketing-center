import type { Env } from './env';
import { getSql } from './db';

// ============================================================================
// Threads API 呼叫紀錄
//   所有打 graph.threads.net 的請求都經過 threadsFetch,寫入 social_api_requests。
//   只存路徑(不含 query string),錯誤訊息會先遮掉 token,避免憑證落地。
// ============================================================================

export type ThreadsAction = 'publish' | 'reply' | 'search' | 'insights' | 'refresh' | 'probe' | 'lookup';

export interface ThreadsCallContext {
  env: Env;
  accountId: string | null;
  brandId: string | null;
  action: ThreadsAction;
  /** 只有「主要對外動作」的 threads_publish 會帶,用來計算每日預算與重複內容 */
  textHash?: string | null;
}

export interface SocialApiRequestRow {
  accountId: string | null;
  brandId: string | null;
  action: ThreadsAction;
  method?: string;
  endpoint?: string | null;
  httpStatus?: number | null;
  errorCode?: number | null;
  errorMessage?: string | null;
  durationMs?: number | null;
  blockedReason?: string | null;
  textHash?: string | null;
}

export function endpointOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/v\d+\.\d+/, '') || '/';
  } catch {
    return '';
  }
}

export function redactSecrets(text: string): string {
  return text
    .replace(/(access_token|input_token|client_secret|code)=[^&\s"']+/gi, '$1=***')
    .replace(/\b(TH|EA)[A-Za-z0-9_-]{30,}\b/g, '***');
}

export async function recordSocialApiRequest(env: Env, row: SocialApiRequestRow): Promise<void> {
  try {
    const sql = getSql(env);
    await sql`
      INSERT INTO social_api_requests
        (account_id, brand_id, platform, action, method, endpoint, http_status, error_code,
         error_message, duration_ms, blocked_reason, text_hash)
      VALUES (${row.accountId}, ${row.brandId}, 'threads', ${row.action}, ${row.method ?? 'GET'},
              ${row.endpoint ?? null}, ${row.httpStatus ?? null}, ${row.errorCode ?? null},
              ${row.errorMessage ? redactSecrets(row.errorMessage).slice(0, 300) : null},
              ${row.durationMs ?? null}, ${row.blockedReason ?? null}, ${row.textHash ?? null})
    `;
  } catch (e) {
    console.warn('[threads-api-log] 寫入 social_api_requests 失敗', e instanceof Error ? e.message : e);
  }
}

function parseErrorBody(body: string): { code: number | null; message: string | null } {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: number; message?: string; error_user_msg?: string } };
    if (parsed.error) {
      return { code: parsed.error.code ?? null, message: parsed.error.error_user_msg || parsed.error.message || null };
    }
  } catch { /* 不是 JSON */ }
  return { code: null, message: body ? body.slice(0, 300) : null };
}

/** fetch 的替代品:ctx 為 null 時不寫紀錄(例如 OAuth 還沒有帳號 id 之前) */
export async function threadsFetch(ctx: ThreadsCallContext | null, url: string, init?: RequestInit): Promise<Response> {
  const started = Date.now();
  const method = (init?.method ?? 'GET').toUpperCase();
  const endpoint = endpointOf(url);
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    if (ctx) {
      await recordSocialApiRequest(ctx.env, {
        accountId: ctx.accountId, brandId: ctx.brandId, action: ctx.action, method, endpoint,
        errorMessage: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started,
      });
    }
    throw e;
  }
  if (ctx) {
    let errorCode: number | null = null;
    let errorMessage: string | null = null;
    if (!res.ok) {
      const body = await res.clone().text().catch(() => '');
      const parsed = parseErrorBody(body);
      errorCode = parsed.code;
      errorMessage = parsed.message;
    }
    const countsAsAction = res.ok && !!ctx.textHash && /\/threads_publish$/.test(endpoint);
    await recordSocialApiRequest(ctx.env, {
      accountId: ctx.accountId, brandId: ctx.brandId, action: ctx.action, method, endpoint,
      httpStatus: res.status, errorCode, errorMessage, durationMs: Date.now() - started,
      textHash: countsAsAction ? ctx.textHash : null,
    });
  }
  return res;
}

export function normalizeForDuplicate(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '').replace(/[\p{P}\p{S}]/gu, '');
}

export async function textHashOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalizeForDuplicate(text)));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
