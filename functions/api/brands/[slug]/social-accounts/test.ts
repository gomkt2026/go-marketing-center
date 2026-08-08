import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { decryptToken } from '../../../../_shared/crypto';

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

  let testUrl: string;
  if (body.platform === 'threads') {
    testUrl = `https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(token)}`;
  } else if (body.platform === 'instagram' && account.external_id) {
    testUrl = `https://graph.facebook.com/v21.0/${encodeURIComponent(account.external_id)}?fields=id,username&access_token=${encodeURIComponent(token)}`;
  } else {
    testUrl = `https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`;
  }

  let ok = false;
  let detail = '';
  let fetchedId: string | null = null;
  try {
    const res = await fetch(testUrl);
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (res.ok) {
      ok = true;
      fetchedId = typeof data.id === 'string' ? data.id : null;
      detail = `連線成功:${JSON.stringify({ id: data.id, name: data.name ?? data.username })}`;
    } else {
      const err = (data as { error?: { message?: string } }).error;
      detail = `平台回應錯誤:${err?.message ?? res.statusText}`;
    }
  } catch (e) {
    detail = `連線失敗:${e instanceof Error ? e.message : '未知錯誤'}`;
  }

  const newStatus = ok ? 'connected' : 'error';
  await sql`
    UPDATE brand_social_accounts
    SET status = ${newStatus}, connected_at = ${ok ? new Date().toISOString() : null}, notes = ${detail},
        external_id = COALESCE(external_id, ${fetchedId})
    WHERE id = ${account.id}::uuid
  `;

  return json({ ok, status: newStatus, detail });
};
