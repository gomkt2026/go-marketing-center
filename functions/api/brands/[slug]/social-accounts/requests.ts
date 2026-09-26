import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { rowsToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';

// 單一帳號最近 50 筆 Threads API 請求紀錄(含被安全閘門擋下的動作)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const brand = await getBrandBySlug(context.env, context.params.slug as string);
  if (!brand) return error('Brand not found', 404);

  const accountId = new URL(context.request.url).searchParams.get('accountId');
  if (!accountId) return error('需要 accountId', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, action, method, endpoint, http_status, error_code, error_message, duration_ms, blocked_reason,
           (text_hash IS NOT NULL) AS counted, created_at
    FROM social_api_requests
    WHERE account_id = ${accountId}::uuid AND brand_id = ${brand.id}::uuid
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return json({ requests: rowsToCamel(rows as Record<string, unknown>[]) });
};
