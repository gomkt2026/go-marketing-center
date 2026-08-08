import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

// 固定 4 個彙總查詢載入品牌全部內容。
// 早期版本對每筆內容各查 3 次(N+1),內容一多就超過 Workers 單請求子請求上限而 500。
async function loadContentsForBrand(env: Env, brandId: string) {
  const sql = getSql(env);
  const [contentRows, versionRows, reviewRows, assetRows] = await Promise.all([
    sql`SELECT * FROM contents WHERE brand_id = ${brandId}::uuid ORDER BY updated_at DESC LIMIT 200`,
    sql`
      SELECT v.* FROM content_versions v
      JOIN contents c ON c.id = v.content_id
      WHERE c.brand_id = ${brandId}::uuid
      ORDER BY v.version_number
    `,
    sql`
      SELECT r.* FROM content_reviews r
      JOIN contents c ON c.id = r.content_id
      WHERE c.brand_id = ${brandId}::uuid
      ORDER BY r.reviewed_at
    `,
    sql`
      SELECT a.*, v.content_id FROM content_assets a
      JOIN content_versions v ON v.id = a.content_version_id
      JOIN contents c ON c.id = v.content_id
      WHERE c.brand_id = ${brandId}::uuid
      ORDER BY a.created_at
    `,
  ]);

  const contents = rowsToCamel(contentRows as Record<string, unknown>[]);
  const versions = rowsToCamel(versionRows as Record<string, unknown>[]);
  const reviews = rowsToCamel(reviewRows as Record<string, unknown>[]);
  const assets = rowsToCamel(assetRows as Record<string, unknown>[]);

  const assetsByVersion = new Map<string, Record<string, unknown>[]>();
  for (const a of assets) {
    const key = a.contentVersionId as string;
    if (!assetsByVersion.has(key)) assetsByVersion.set(key, []);
    assetsByVersion.get(key)!.push(a);
  }
  const versionsByContent = new Map<string, Record<string, unknown>[]>();
  for (const v of versions) {
    const key = v.contentId as string;
    if (!versionsByContent.has(key)) versionsByContent.set(key, []);
    versionsByContent.get(key)!.push({ ...v, assets: assetsByVersion.get(v.id as string) ?? [] });
  }
  const reviewsByContent = new Map<string, Record<string, unknown>[]>();
  for (const r of reviews) {
    const key = r.contentId as string;
    if (!reviewsByContent.has(key)) reviewsByContent.set(key, []);
    reviewsByContent.get(key)!.push(r);
  }

  return contents.map((c) => ({
    ...c,
    versions: versionsByContent.get(c.id as string) ?? [],
    reviews: reviewsByContent.get(c.id as string) ?? [],
  }));
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
