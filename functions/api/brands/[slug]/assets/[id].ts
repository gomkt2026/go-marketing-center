import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';

// DELETE /api/brands/:slug/assets/:id:刪除一張品牌智慧圖片素材(R2 檔案 + DB 紀錄)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const assetId = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, file_url FROM brand_assets
    WHERE id = ${assetId}::uuid AND brand_id = ${brand.id}::uuid AND asset_type = 'image'
    LIMIT 1
  `;
  if (!rows.length) return error('Asset not found', 404);
  const asset = rows[0] as { id: string; file_url: string | null };

  if (context.env.MEDIA && asset.file_url?.startsWith('/api/media/')) {
    const key = asset.file_url.replace('/api/media/', '');
    await context.env.MEDIA.delete(key).catch(() => undefined);
  }

  await sql`DELETE FROM brand_assets WHERE id = ${assetId}::uuid`;
  return json({ ok: true });
};
