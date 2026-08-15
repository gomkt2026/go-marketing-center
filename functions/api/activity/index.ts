import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, isSuperAdmin, canAccessBrand, forbidden } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json } from '../../_shared/response';
import { ACTION_LABELS } from '../../_shared/activity';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const brandId = url.searchParams.get('brandId');

  if (brandId && !canAccessBrand(auth, brandId)) return forbidden();

  const sql = getSql(context.env);
  const fetched = brandId
    ? await sql`SELECT * FROM activity_logs WHERE brand_id = ${brandId}::uuid ORDER BY created_at DESC LIMIT 100`
    : await sql`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100`;
  const rows = isSuperAdmin(auth) || brandId
    ? fetched
    : (fetched as { brand_id: string }[]).filter((r) => auth.brandIds.includes(r.brand_id));

  return json({
    activity: rowsToCamel(rows as Record<string, unknown>[]),
    actionLabels: ACTION_LABELS,
  });
};
