import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const collabRows = await sql`SELECT * FROM collaborations ORDER BY created_at DESC`;
  const collaborations = [];

  for (const row of collabRows as Record<string, unknown>[]) {
    const c = rowsToCamel([row])[0] as Record<string, unknown>;
    const brands = await sql`
      SELECT brand_id FROM collaboration_brands WHERE collaboration_id = ${c.id}::uuid
    `;
    const briefs = await sql`
      SELECT * FROM collaboration_briefs WHERE collaboration_id = ${c.id}::uuid ORDER BY version_number DESC LIMIT 1
    `;
    collaborations.push({
      ...c,
      brandIds: (brands as { brand_id: string }[]).map((b) => b.brand_id),
      latestBrief: briefs.length ? rowsToCamel(briefs as Record<string, unknown>[])[0] : null,
    });
  }

  return json({ collaborations });
};
