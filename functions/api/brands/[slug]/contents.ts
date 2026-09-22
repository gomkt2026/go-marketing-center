import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

const LIST_STATUSES = ['draft', 'pending_review', 'needs_revision', 'approved', 'rejected', 'scheduled', 'published', 'archived'] as const;

function isWebsiteRow(row: { contentType?: string; targetPlatform?: string | null }) {
  return row.contentType === 'article' && (row.targetPlatform === 'website' || !row.targetPlatform);
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const url = new URL(context.request.url);
  const statusParam = url.searchParams.get('status');
  const platform = url.searchParams.get('platform') ?? 'all';
  const status = statusParam && LIST_STATUSES.includes(statusParam as typeof LIST_STATUSES[number])
    ? statusParam
    : null;

  const sql = getSql(context.env);

  const countRows = await sql`
    SELECT status::text AS status, count(*)::int AS n
    FROM contents
    WHERE brand_id = ${brand.id}::uuid
    GROUP BY status
  `;
  const counts: Record<string, number> = {};
  for (const row of countRows as { status: string; n: number }[]) {
    counts[row.status] = row.n;
  }
  counts.approved = (counts.approved ?? 0) + (counts.published ?? 0);

  const listRows = status === 'approved'
    ? await sql`
        SELECT c.id, c.campaign_id, c.content_type, c.target_platform, c.title, c.status, c.updated_at,
               v.id AS version_id, v.version_number,
               EXISTS (SELECT 1 FROM content_assets a WHERE a.content_version_id = v.id AND a.asset_type = 'image') AS has_image,
               EXISTS (SELECT 1 FROM content_assets a WHERE a.content_version_id = v.id AND a.asset_type = 'video') AS has_video
        FROM contents c
        LEFT JOIN LATERAL (
          SELECT id, version_number FROM content_versions
          WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1
        ) v ON true
        WHERE c.brand_id = ${brand.id}::uuid AND c.status IN ('approved', 'published')
        ORDER BY c.updated_at DESC
        LIMIT 300
      `
    : status
      ? await sql`
          SELECT c.id, c.campaign_id, c.content_type, c.target_platform, c.title, c.status, c.updated_at,
                 v.id AS version_id, v.version_number,
                 EXISTS (SELECT 1 FROM content_assets a WHERE a.content_version_id = v.id AND a.asset_type = 'image') AS has_image,
                 EXISTS (SELECT 1 FROM content_assets a WHERE a.content_version_id = v.id AND a.asset_type = 'video') AS has_video
          FROM contents c
          LEFT JOIN LATERAL (
            SELECT id, version_number FROM content_versions
            WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1
          ) v ON true
          WHERE c.brand_id = ${brand.id}::uuid AND c.status = ${status}::content_status
          ORDER BY c.updated_at DESC
          LIMIT 200
        `
      : await sql`
          SELECT c.id, c.campaign_id, c.content_type, c.target_platform, c.title, c.status, c.updated_at,
                 v.id AS version_id, v.version_number,
                 EXISTS (SELECT 1 FROM content_assets a WHERE a.content_version_id = v.id AND a.asset_type = 'image') AS has_image,
                 EXISTS (SELECT 1 FROM content_assets a WHERE a.content_version_id = v.id AND a.asset_type = 'video') AS has_video
          FROM contents c
          LEFT JOIN LATERAL (
            SELECT id, version_number FROM content_versions
            WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1
          ) v ON true
          WHERE c.brand_id = ${brand.id}::uuid
          ORDER BY c.updated_at DESC
          LIMIT 200
        `;

  let contents = rowsToCamel(listRows as Record<string, unknown>[]);
  if (platform === 'seo') {
    contents = contents.filter((c) => isWebsiteRow(c as { contentType?: string; targetPlatform?: string | null }));
  } else if (platform !== 'all') {
    contents = contents.filter((c) => (c as { targetPlatform?: string }).targetPlatform === platform);
  }

  const platformCounts = { all: 0, facebook: 0, instagram: 0, threads: 0, seo: 0 };
  for (const c of rowsToCamel(listRows as Record<string, unknown>[])) {
    platformCounts.all += 1;
    const row = c as { contentType?: string; targetPlatform?: string | null };
    if (row.targetPlatform === 'facebook') platformCounts.facebook += 1;
    if (row.targetPlatform === 'instagram') platformCounts.instagram += 1;
    if (row.targetPlatform === 'threads') platformCounts.threads += 1;
    if (isWebsiteRow(row)) platformCounts.seo += 1;
  }

  return json({ contents, counts, platformCounts });
};
