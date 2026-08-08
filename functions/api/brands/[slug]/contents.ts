import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

async function loadContentsForBrand(env: Env, brandId: string) {
  const sql = getSql(env);
  const contentRows = await sql`
    SELECT * FROM contents WHERE brand_id = ${brandId}::uuid ORDER BY updated_at DESC
  `;
  const contents = rowsToCamel(contentRows as Record<string, unknown>[]);
  const result = [];
  for (const c of contents) {
    const contentId = c.id as string;
    const [versions, reviews, assets] = await Promise.all([
      sql`SELECT * FROM content_versions WHERE content_id = ${contentId}::uuid ORDER BY version_number`,
      sql`SELECT * FROM content_reviews WHERE content_id = ${contentId}::uuid ORDER BY reviewed_at`,
      sql`
        SELECT a.* FROM content_assets a
        JOIN content_versions v ON v.id = a.content_version_id
        WHERE v.content_id = ${contentId}::uuid
        ORDER BY a.created_at
      `,
    ]);
    const assetList = rowsToCamel(assets as Record<string, unknown>[]);
    const versionList = rowsToCamel(versions as Record<string, unknown>[]).map((v) => ({
      ...v,
      assets: assetList.filter((a) => a.contentVersionId === v.id),
    }));
    result.push({
      ...c,
      versions: versionList,
      reviews: rowsToCamel(reviews as Record<string, unknown>[]),
    });
  }
  return result;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const contents = await loadContentsForBrand(context.env, brand.id);
  return json({ contents });
};
