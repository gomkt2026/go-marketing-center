import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { decryptToken } from '../../../../_shared/crypto';
import { probeThreadsPublishAccess } from '../../../../_shared/threads';
import { probeMetaPublishAccess } from '../../../../_shared/meta';

// 以已儲存的 token 測試平台連線;成功則將狀態升級為 connected
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as { platform?: string };
  if (!body.platform) return error('platform is required', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_social_accounts
    WHERE brand_id = ${brand.id}::uuid AND platform = ${body.platform} LIMIT 1
  `;
  if (!rows.length) return error('尚未設定此平台帳號', 404);
  const account = rows[0] as { id: string; external_id: string | null; access_token_enc: string | null };
  if (!account.access_token_enc) return error('尚未填入 access token,目前僅能使用手動發布', 400);

  const token = await decryptToken(context.env, account.access_token_enc);

  if (body.platform === 'threads') {
    const probe = await probeThreadsPublishAccess(token);
    await sql`
      UPDATE brand_social_accounts
      SET status = ${probe.ok ? 'connected' : 'error'},
          connected_at = ${probe.ok ? new Date().toISOString() : null},
          notes = ${probe.detail},
          external_id = COALESCE(${probe.userId}, external_id)
      WHERE id = ${account.id}::uuid
    `;
    return json({ ok: probe.ok, status: probe.ok ? 'connected' : 'error', detail: probe.detail });
  }

  if (body.platform === 'facebook' || body.platform === 'instagram') {
    const probe = await probeMetaPublishAccess(token, body.platform, account.external_id);
    await sql`
      UPDATE brand_social_accounts
      SET status = ${probe.ok ? 'connected' : 'error'},
          connected_at = ${probe.ok ? new Date().toISOString() : null},
          notes = ${probe.detail},
          external_id = COALESCE(external_id, ${probe.fetchedId})
      WHERE id = ${account.id}::uuid
    `;
    return json({ ok: probe.ok, status: probe.ok ? 'connected' : 'error', detail: probe.detail });
  }

  return error('不支援的平台', 400);
};
