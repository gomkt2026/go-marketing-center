import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, canAccessBrand } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const contentId = context.params.id as string;
  const sql = getSql(context.env);
  const contentRows = await sql`
    SELECT * FROM contents WHERE id = ${contentId}::uuid LIMIT 1
  `;
  if (!contentRows.length) return error('找不到內容', 404);
  const content = rowsToCamel(contentRows as Record<string, unknown>[])[0] as {
    id: string; brandId: string;
  };
  if (!canAccessBrand(auth, content.brandId)) return error('Forbidden', 403);

  const versionRows = await sql`
    SELECT * FROM content_versions
    WHERE content_id = ${contentId}::uuid
    ORDER BY version_number DESC
    LIMIT 1
  `;
  const versions = rowsToCamel(versionRows as Record<string, unknown>[]);
  const versionId = versions[0]?.id as string | undefined;

  const [reviewRows, assetRows] = await Promise.all([
    sql`
      SELECT * FROM content_reviews
      WHERE content_id = ${contentId}::uuid
      ORDER BY reviewed_at
    `,
    versionId
      ? sql`
          SELECT * FROM content_assets
          WHERE content_version_id = ${versionId}::uuid
          ORDER BY created_at
        `
      : Promise.resolve([]),
  ]);

  const assets = rowsToCamel(assetRows as Record<string, unknown>[]);
  const latest = versions[0]
    ? { ...versions[0], assets }
    : null;

  return json({
    content: {
      ...content,
      versions: latest ? [latest] : [],
      reviews: rowsToCamel(reviewRows as Record<string, unknown>[]),
    },
  });
};
