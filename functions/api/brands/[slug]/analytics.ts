import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT pr.*, c.title AS content_title, c.id AS content_id
    FROM performance_reports pr
    JOIN publishing_jobs pj ON pj.id = pr.publishing_job_id
    JOIN contents c ON c.id = pj.content_id
    WHERE c.brand_id = ${brand.id}::uuid
    ORDER BY pr.captured_at DESC
  `;

  const reports = (rows as Record<string, unknown>[]).map((r) => ({
    perf: rowToCamel(r),
    content: { id: r.content_id, title: r.content_title },
  }));

  const totals = (rows as Record<string, unknown>[]).reduce(
    (acc, r) => ({
      impressions: acc.impressions + Number(r.impressions ?? 0),
      clicks: acc.clicks + Number(r.clicks ?? 0),
      comments: acc.comments + Number(r.comments ?? 0),
      shares: acc.shares + Number(r.shares ?? 0),
      saves: acc.saves + Number(r.saves ?? 0),
    }),
    { impressions: 0, clicks: 0, comments: 0, shares: 0, saves: 0 },
  );

  return json({ reports, totals });
};
