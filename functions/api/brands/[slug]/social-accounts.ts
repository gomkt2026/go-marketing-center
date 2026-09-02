import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel, rowToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { encryptToken, decryptToken, maskToken } from '../../../_shared/crypto';
import { logActivity } from '../../../_shared/activity';
import { clampReplyDailyCap, clampReplyHourlyCap } from '../../../_shared/threads-replies';

const SUPPORTED = ['facebook', 'instagram', 'threads'];

function sanitize(row: Record<string, unknown>) {
  const account = rowToCamel(row) as Record<string, unknown>;
  delete account.accessTokenEnc;
  return account;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_social_accounts WHERE brand_id = ${brand.id}::uuid ORDER BY platform
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
    accounts.push({ ...acc, tokenMasked, hasToken: !!row.access_token_enc });
  }
  return json({ accounts });
};

// upsert 單一平台的帳號設定
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    platform?: string;
    accountName?: string;
    externalId?: string;
    accessToken?: string;   // 提供則覆寫;undefined 表示不變
    clearToken?: boolean;   // true 則清除 token
    notes?: string;
    autoPublish?: boolean;  // 排程生成後直接發布(threads / facebook / instagram)
    autoReply?: boolean;    // 自動回覆熱門貼文(threads)
    replyDailyCap?: number; // 每日回覆上限
    replyHourlyCap?: number; // 每小時回覆上限(1-20)
  };
  if (!body.platform || !SUPPORTED.includes(body.platform)) {
    return error(`platform 必須為 ${SUPPORTED.join(' / ')}`, 400);
  }

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM brand_social_accounts
    WHERE brand_id = ${brand.id}::uuid AND platform = ${body.platform} LIMIT 1
  `;

  let tokenEnc: string | null = existing.length
    ? ((existing[0] as { access_token_enc: string | null }).access_token_enc)
    : null;
  let tokenExpiresAt: string | null = existing.length
    ? ((existing[0] as { token_expires_at: string | null }).token_expires_at)
    : null;
  if (body.clearToken) {
    tokenEnc = null;
    tokenExpiresAt = null;
  } else if (body.accessToken?.trim()) {
    tokenEnc = await encryptToken(context.env, body.accessToken.trim());
    // 換了新 token,舊的到期時間不再有效;24 小時後排程會自動確認新 token 效期並續期
    tokenExpiresAt = null;
  }

  // 有 token 即進入手動發布模式(connected 需通過連線測試)
  const status = tokenEnc ? 'manual' : (body.accountName?.trim() ? 'manual' : 'disconnected');
  const prev = existing.length ? existing[0] as {
    auto_publish: boolean; auto_reply: boolean; reply_daily_cap: number; reply_hourly_cap: number;
  } : null;
  const autoPublish = (body.autoPublish ?? prev?.auto_publish ?? false) && !!tokenEnc;
  const autoReply = (body.autoReply ?? prev?.auto_reply ?? false) && !!tokenEnc;
  const replyDailyCap = clampReplyDailyCap(body.replyDailyCap ?? prev?.reply_daily_cap);
  const replyHourlyCap = clampReplyHourlyCap(body.replyHourlyCap ?? prev?.reply_hourly_cap);

  const rows = await sql`
    INSERT INTO brand_social_accounts (brand_id, platform, account_name, external_id, access_token_enc, token_expires_at, status, notes, auto_publish, auto_reply, reply_daily_cap, reply_hourly_cap, connected_at)
    VALUES (${brand.id}::uuid, ${body.platform}, ${body.accountName ?? null}, ${body.externalId ?? null},
            ${tokenEnc}, ${tokenExpiresAt}, ${status}, ${body.notes ?? null}, ${autoPublish}, ${autoReply}, ${replyDailyCap}, ${replyHourlyCap}, ${tokenEnc ? new Date().toISOString() : null})
    ON CONFLICT (brand_id, platform) DO UPDATE SET
      account_name = EXCLUDED.account_name,
      external_id = EXCLUDED.external_id,
      access_token_enc = EXCLUDED.access_token_enc,
      token_expires_at = EXCLUDED.token_expires_at,
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      auto_publish = EXCLUDED.auto_publish,
      auto_reply = EXCLUDED.auto_reply,
      reply_daily_cap = EXCLUDED.reply_daily_cap,
      reply_hourly_cap = EXCLUDED.reply_hourly_cap,
      connected_at = EXCLUDED.connected_at
    RETURNING *
  `;

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'social_account.updated',
    entityType: 'brand_social_account',
    entityId: (rows[0] as { id: string }).id,
    afterState: { platform: body.platform, status },
  });

  const acc = sanitize(rows[0] as Record<string, unknown>);
  return json({ account: { ...acc, hasToken: !!tokenEnc } });
};
