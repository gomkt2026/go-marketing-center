import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

// 內容中心只要最新一版就能審稿。歷史版本、全品牌資產一次拉會讓 JSON 大到頁面卡死。
async function loadContentsForBrand(env: Env, brandId: string) {
  const sql = getSql(env);
  const contentRows = await sql`
    SELECT * FROM contents
    WHERE brand_id = ${brandId}::uuid
    ORDER BY updated_at DESC
    LIMIT 200
  `;
  const contents = rowsToCamel(contentRows as Record<string, unknown>[]);
  const ids = contents.map((c) => c.id as string);
  if (!ids.length) return [];

  const versionRows = await sql`
    SELECT DISTINCT ON (v.content_id) v.*
    FROM content_versions v
    WHERE v.content_id = ANY(${ids}::uuid[])
    ORDER BY v.content_id, v.version_number DESC
  `;
  const versions = rowsToCamel(versionRows as Record<string, unknown>[]);
  const versionIds = versions.map((v) => v.id as string);

  const [reviewRows, assetRows] = await Promise.all([
    sql`
      SELECT r.* FROM content_reviews r
      WHERE r.content_id = ANY(${ids}::uuid[])
      ORDER BY r.reviewed_at
    `,
    versionIds.length
      ? sql`
          SELECT a.*, v.content_id
          FROM content_assets a
          JOIN content_versions v ON v.id = a.content_version_id
          WHERE a.content_version_id = ANY(${versionIds}::uuid[])
          ORDER BY a.created_at
        `
      : Promise.resolve([]),
  ]);

  const reviews = rowsToCamel(reviewRows as Record<string, unknown>[]);
  const assets = rowsToCamel(assetRows as Record<string, unknown>[]);

  const assetsByVersion = new Map<string, Record<string, unknown>[]>();
  for (const a of assets) {
    const key = a.contentVersionId as string;
    if (!assetsByVersion.has(key)) assetsByVersion.set(key, []);
    assetsByVersion.get(key)!.push(a);
  }
  const latestByContent = new Map<string, Record<string, unknown>>();
  for (const v of versions) {
    latestByContent.set(v.contentId as string, {
      ...v,
      assets: assetsByVersion.get(v.id as string) ?? [],
    });
  }
  const reviewsByContent = new Map<string, Record<string, unknown>[]>();
  for (const r of reviews) {
    const key = r.contentId as string;
    if (!reviewsByContent.has(key)) reviewsByContent.set(key, []);
    reviewsByContent.get(key)!.push(r);
  }

  return contents.map((c) => {
    const latest = latestByContent.get(c.id as string);
    return {
      ...c,
      versions: latest ? [latest] : [],
      reviews: reviewsByContent.get(c.id as string) ?? [],
    };
  });
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
