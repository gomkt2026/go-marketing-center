import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { getAuthUser } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { encryptToken } from '../../_shared/crypto';
import { logActivity } from '../../_shared/activity';
import { THREADS_API, THREADS_SCOPE_FEATURES, refreshThreadsAccountScopes } from '../../_shared/threads';
import { threadsFetch } from '../../_shared/threads-api-log';
import { verifyOAuthState, threadsRedirectUri, exchangeThreadsCode, threadsOAuthConfigured } from '../../_shared/threads-oauth';

function back(requestUrl: string, slug: string | null, params: Record<string, string>): Response {
  const path = slug ? `/${slug}/social` : '/';
  const url = new URL(path, requestUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

// Threads 授權視窗導回這裡:驗 state → 換長效 token → 新增或更新帳號列 → 偵測授權範圍 → 回社群帳號頁
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const rawState = url.searchParams.get('state') ?? '';
  const state = rawState ? await verifyOAuthState(context.env, rawState) : null;
  const slug = state?.slug ?? null;

  if (!state) return back(context.request.url, null, { threads_oauth: 'error', message: '授權逾時或 state 驗證失敗,請重新按「連線 Threads 帳號」' });

  const denied = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (denied) return back(context.request.url, slug, { threads_oauth: 'error', message: `授權被取消:${denied}` });

  const user = await getAuthUser(context.request, context.env);
  if (!user || user.id !== state.userId) {
    return back(context.request.url, slug, { threads_oauth: 'error', message: '登入身分與發起授權的人不同,請重新登入後再連線' });
  }
  if (!threadsOAuthConfigured(context.env)) {
    return back(context.request.url, slug, { threads_oauth: 'error', message: '尚未設定 THREADS_APP_ID / THREADS_APP_SECRET' });
  }

  const code = (url.searchParams.get('code') ?? '').replace(/#_$/, '');
  if (!code) return back(context.request.url, slug, { threads_oauth: 'error', message: '授權回傳缺少 code' });

  try {
    const redirectUri = threadsRedirectUri(context.env, context.request.url);
    const token = await exchangeThreadsCode(context.env, code, redirectUri);

    const meRes = await threadsFetch(
      { env: context.env, accountId: null, brandId: state.brandId, action: 'lookup' },
      `${THREADS_API}/me?fields=id,username&access_token=${encodeURIComponent(token.accessToken)}`,
    );
    const me = await meRes.json().catch(() => ({})) as { id?: string; username?: string };
    const threadsUserId = me.id ?? token.userId;
    if (!threadsUserId) throw new Error('換到 token 但讀不到 Threads 帳號資料');

    const sql = getSql(context.env);
    const enc = await encryptToken(context.env, token.accessToken);
    const existing = await sql`
      SELECT id FROM brand_social_accounts
      WHERE brand_id = ${state.brandId}::uuid AND platform = 'threads' AND external_id = ${threadsUserId}
      LIMIT 1
    ` as { id: string }[];

    let accountId: string;
    let created = false;
    if (existing.length) {
      accountId = existing[0].id;
      await sql`
        UPDATE brand_social_accounts SET
          access_token_enc = ${enc}, token_expires_at = ${token.expiresAt},
          account_name = COALESCE(${me.username ?? null}, account_name),
          status = 'connected', connected_at = now(), connected_via = 'oauth', last_refreshed_at = now(),
          notes = ${'已透過 Threads 授權視窗重新連線'}
        WHERE id = ${accountId}::uuid
      `;
    } else {
      // 舊資料可能有一列還沒記 external_id 的主帳號,優先補上它,不要多開一列
      const legacy = await sql`
        SELECT id FROM brand_social_accounts
        WHERE brand_id = ${state.brandId}::uuid AND platform = 'threads' AND external_id IS NULL
        ORDER BY is_primary DESC LIMIT 1
      ` as { id: string }[];
      const hasPrimary = await sql`
        SELECT 1 FROM brand_social_accounts WHERE brand_id = ${state.brandId}::uuid AND platform = 'threads' AND is_primary LIMIT 1
      `;
      if (legacy.length) {
        accountId = legacy[0].id;
        await sql`
          UPDATE brand_social_accounts SET
            external_id = ${threadsUserId}, account_name = ${me.username ?? null},
            access_token_enc = ${enc}, token_expires_at = ${token.expiresAt},
            status = 'connected', connected_at = now(), connected_via = 'oauth', last_refreshed_at = now(),
            notes = ${'已透過 Threads 授權視窗連線'}
          WHERE id = ${accountId}::uuid
        `;
      } else {
        const rows = await sql`
          INSERT INTO brand_social_accounts (
            brand_id, platform, account_name, external_id, access_token_enc, token_expires_at,
            status, notes, connected_at, connected_via, last_refreshed_at, is_primary
          ) VALUES (
            ${state.brandId}::uuid, 'threads', ${me.username ?? null}, ${threadsUserId}, ${enc}, ${token.expiresAt},
            'connected', ${'已透過 Threads 授權視窗連線'}, now(), 'oauth', now(), ${!hasPrimary.length}
          )
          RETURNING id
        ` as { id: string }[];
        accountId = rows[0].id;
        created = true;
      }
    }

    const inspection = await refreshThreadsAccountScopes(context.env, accountId, state.brandId, token.accessToken);
    const missing = inspection
      ? THREADS_SCOPE_FEATURES.filter((s) => !inspection.scopes.includes(s.scope)).map((s) => s.scope)
      : [];

    await logActivity(context.env, {
      brandId: state.brandId,
      actorType: 'user',
      actorUserId: user.id,
      action: created ? 'social_account.connected' : 'social_account.reconnected',
      entityType: 'brand_social_account',
      entityId: accountId,
      afterState: { platform: 'threads', via: 'oauth', username: me.username ?? null, scopes: inspection?.scopes ?? null },
    });

    return back(context.request.url, slug, {
      threads_oauth: 'ok',
      account: me.username ?? threadsUserId,
      ...(missing.length ? { missing: missing.join(',') } : {}),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[threads-oauth] callback 失敗', message);
    return back(context.request.url, slug, { threads_oauth: 'error', message: message.slice(0, 200) });
  }
};
