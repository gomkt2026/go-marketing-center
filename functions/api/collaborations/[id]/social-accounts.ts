import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { encryptToken, decryptToken, maskToken } from '../../../_shared/crypto';
import { logActivity } from '../../../_shared/activity';

// Collaboration 範圍的社群帳號(目前只有 Go 生態系共用的 X 帳號會用到,見 migration 009)
const SUPPORTED = ['x'];

function sanitize(row: Record<string, unknown>) {
  const account = rowToCamel(row) as Record<string, unknown>;
  delete account.accessTokenEnc;
  delete account.refreshTokenEnc;
  return account;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const collaborationId = context.params.id as string;
  const sql = getSql(context.env);
  const collabRows = await sql`SELECT id, title FROM collaborations WHERE id = ${collaborationId}::uuid LIMIT 1`;
  if (!collabRows.length) return error('Collaboration not found', 404);

  const rows = await sql`
    SELECT * FROM brand_social_accounts WHERE collaboration_id = ${collaborationId}::uuid ORDER BY platform
  `;

  const accounts = [];
  for (const row of rows as Record<string, unknown>[]) {
    const acc = sanitize(row);
    let tokenMasked: string | null = null;
    if (row.access_token_enc) {
      try {
        tokenMasked = maskToken(await decryptToken(context.env, row.access_token_enc as string));
      } catch {
        tokenMasked = '****(解密失敗)';
      }
    }
    accounts.push({ ...acc, tokenMasked, hasToken: !!row.access_token_enc, hasRefreshToken: !!row.refresh_token_enc });
  }
  return json({ accounts });
};

// upsert 單一平台的 collaboration 範圍帳號設定(目前只有 platform=x)
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const collaborationId = context.params.id as string;
  const sql = getSql(context.env);
  const collabRows = await sql`SELECT id, title FROM collaborations WHERE id = ${collaborationId}::uuid LIMIT 1`;
  if (!collabRows.length) return error('Collaboration not found', 404);

  const body = await context.request.json() as {
    platform?: string;
    accountName?: string;
    externalId?: string;      // X 帳號 handle(不含 @),用於組 permalink
    accessToken?: string;     // OAuth2 access token,提供則覆寫;undefined 表示不變
    refreshToken?: string;    // OAuth2 refresh token,提供則覆寫;undefined 表示不變
    clearToken?: boolean;     // true 則清除 access/refresh token
    notes?: string;
    autoPublish?: boolean;
  };
  if (!body.platform || !SUPPORTED.includes(body.platform)) {
    return error(`platform 必須為 ${SUPPORTED.join(' / ')}`, 400);
  }

  const existing = await sql`
    SELECT * FROM brand_social_accounts
    WHERE collaboration_id = ${collaborationId}::uuid AND platform = ${body.platform} LIMIT 1
  `;

  let tokenEnc: string | null = existing.length
    ? ((existing[0] as { access_token_enc: string | null }).access_token_enc)
    : null;
  let refreshTokenEnc: string | null = existing.length
    ? ((existing[0] as { refresh_token_enc: string | null }).refresh_token_enc)
    : null;
  let tokenExpiresAt: string | null = existing.length
    ? ((existing[0] as { token_expires_at: string | null }).token_expires_at)
    : null;
  if (body.clearToken) {
    tokenEnc = null;
    refreshTokenEnc = null;
    tokenExpiresAt = null;
  } else {
    if (body.accessToken?.trim()) {
      tokenEnc = await encryptToken(context.env, body.accessToken.trim());
      tokenExpiresAt = null; // 換了新 token,舊的到期時間不再有效;下次排程 refresh 會自動確認
    }
    if (body.refreshToken?.trim()) {
      refreshTokenEnc = await encryptToken(context.env, body.refreshToken.trim());
    }
  }

  const status = tokenEnc ? 'manual' : (body.accountName?.trim() ? 'manual' : 'disconnected');
  const prev = existing.length ? existing[0] as { auto_publish: boolean } : null;
  const autoPublish = (body.autoPublish ?? prev?.auto_publish ?? false) && !!tokenEnc;

  const rows = await sql`
    INSERT INTO brand_social_accounts (
      brand_id, collaboration_id, platform, account_name, external_id,
      access_token_enc, refresh_token_enc, token_expires_at, status, notes, auto_publish, connected_at
    )
    VALUES (
      NULL, ${collaborationId}::uuid, ${body.platform}, ${body.accountName ?? null}, ${body.externalId ?? null},
      ${tokenEnc}, ${refreshTokenEnc}, ${tokenExpiresAt}, ${status}, ${body.notes ?? null}, ${autoPublish},
      ${tokenEnc ? new Date().toISOString() : null}
    )
    ON CONFLICT (collaboration_id, platform) WHERE collaboration_id IS NOT NULL DO UPDATE SET
      account_name = EXCLUDED.account_name,
      external_id = EXCLUDED.external_id,
      access_token_enc = EXCLUDED.access_token_enc,
      refresh_token_enc = EXCLUDED.refresh_token_enc,
      token_expires_at = EXCLUDED.token_expires_at,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      auto_publish = EXCLUDED.auto_publish,
      connected_at = EXCLUDED.connected_at
    RETURNING *
  `;

  await logActivity(context.env, {
    collaborationId,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'social_account.updated',
    entityType: 'brand_social_account',
    entityId: (rows[0] as { id: string }).id,
    afterState: { platform: body.platform, status },
  });

  const acc = sanitize(rows[0] as Record<string, unknown>);
  return json({ account: { ...acc, hasToken: !!tokenEnc, hasRefreshToken: !!refreshTokenEnc } });
};
