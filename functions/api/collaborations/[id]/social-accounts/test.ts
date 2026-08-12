import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { json, error } from '../../../../_shared/response';
import { decryptToken } from '../../../../_shared/crypto';

// 以已儲存的 X access token 測試連線(GET /2/users/me);成功則將狀態升級為 connected 並記錄 handle
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const collaborationId = context.params.id as string;
  const body = await context.request.json() as { platform?: string };
  if (body.platform !== 'x') return error('platform 目前只支援 x', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_social_accounts
    WHERE collaboration_id = ${collaborationId}::uuid AND platform = 'x' LIMIT 1
  `;
  if (!rows.length) return error('尚未設定 X 帳號', 404);
  const account = rows[0] as { id: string; access_token_enc: string | null };
  if (!account.access_token_enc) return error('尚未填入 access token', 400);

  const token = await decryptToken(context.env, account.access_token_enc);

  let ok = false;
  let detail = '';
  let handle: string | null = null;
  try {
    const res = await fetch('https://api.x.com/2/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({})) as { data?: { id?: string; username?: string }; errors?: { message?: string }[] };
    if (res.ok && data.data) {
      ok = true;
      handle = data.data.username ?? null;
      detail = `連線成功:@${data.data.username ?? ''}(id=${data.data.id ?? ''})`;
    } else {
      detail = `平台回應錯誤:${data.errors?.[0]?.message ?? res.statusText}`;
    }
  } catch (e) {
    detail = `連線失敗:${e instanceof Error ? e.message : '未知錯誤'}`;
  }

  const newStatus = ok ? 'connected' : 'error';
  await sql`
    UPDATE brand_social_accounts
    SET status = ${newStatus}, connected_at = ${ok ? new Date().toISOString() : null}, notes = ${detail},
        external_id = COALESCE(external_id, ${handle})
    WHERE id = ${account.id}::uuid
  `;

  return json({ ok, status: newStatus, detail });
};
