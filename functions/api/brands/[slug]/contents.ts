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
    const [versions, reviews] = await Promise.all([
      sql`SELECT * FROM content_versions WHERE content_id = ${contentId}::uuid ORDER BY version_number`,
      sql`SELECT * FROM content_reviews WHERE content_id = ${contentId}::uuid ORDER BY reviewed_at`,
    ]);
    result.push({
      ...c,
      versions: rowsToCamel(versions as Record<string, unknown>[]),
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
