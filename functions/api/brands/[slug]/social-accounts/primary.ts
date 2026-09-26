import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';

// 把指定 Threads 帳號設為品牌主帳號(排程發文、熱門回覆、成效回收都用主帳號)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const brand = await getBrandBySlug(context.env, context.params.slug as string);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as { accountId?: string };
  if (!body.accountId) return error('需要 accountId', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, access_token_enc, status, account_name FROM brand_social_accounts
    WHERE id = ${body.accountId}::uuid AND brand_id = ${brand.id}::uuid AND platform = 'threads' LIMIT 1
  ` as { id: string; access_token_enc: string | null; status: string; account_name: string | null }[];
  if (!rows.length) return error('找不到這個 Threads 帳號', 404);
  const target = rows[0];
  if (!target.access_token_enc || target.status === 'error') {
    return error('這個帳號尚未連線或連線異常,請先重新連線再設為主帳號', 400);
  }

  await sql`
    UPDATE brand_social_accounts SET is_primary = false
    WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' AND is_primary AND id <> ${target.id}::uuid
  `;
  await sql`UPDATE brand_social_accounts SET is_primary = true WHERE id = ${target.id}::uuid`;

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'social_account.primary_changed',
    entityType: 'brand_social_account',
    entityId: target.id,
    afterState: { platform: 'threads', accountName: target.account_name },
  });
  return json({ ok: true });
};
