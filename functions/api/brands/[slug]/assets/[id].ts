import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { rowsToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import {
  ensureBrandAssetLibrary,
  isAssetRole,
  isAssetStatus,
  isImageCategory,
} from '../../../../_shared/brand-assets';

// PATCH /api/brands/:slug/assets/:id:更新素材語意欄位,不改檔案與使用次數
export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const assetId = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    name?: string;
    caption?: string | null;
    imageCategory?: string | null;
    assetRole?: string | null;
    feature?: string | null;
    usageContext?: string | null;
    assetStatus?: string;
  };

  await ensureBrandAssetLibrary(context.env).catch(() => undefined);
  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM brand_assets
    WHERE id = ${assetId}::uuid AND brand_id = ${brand.id}::uuid AND asset_type = 'image'
    LIMIT 1
  `;
  if (!existing.length) return error('Asset not found', 404);
  const current = existing[0] as {
    name: string;
    caption: string | null;
    image_category: string | null;
    asset_role: string | null;
    feature: string | null;
    usage_context: string | null;
    asset_status: string | null;
  };

  const name = body.name !== undefined ? (String(body.name).trim() || current.name) : current.name;
  const caption = body.caption !== undefined ? (String(body.caption ?? '').trim() || null) : current.caption;
  const imageCategory = body.imageCategory !== undefined
    ? (isImageCategory(String(body.imageCategory ?? '')) ? String(body.imageCategory) : null)
    : current.image_category;
  const assetRole = body.assetRole !== undefined
    ? (isAssetRole(String(body.assetRole ?? '')) ? String(body.assetRole) : null)
    : current.asset_role;
  const feature = body.feature !== undefined ? (String(body.feature ?? '').trim() || null) : current.feature;
  const usageContext = body.usageContext !== undefined
    ? (String(body.usageContext ?? '').trim() || null)
    : current.usage_context;
  const assetStatus = body.assetStatus !== undefined
    ? (isAssetStatus(String(body.assetStatus)) ? String(body.assetStatus) : 'active')
    : (current.asset_status || 'active');

  const updated = await sql`
    UPDATE brand_assets SET
      name = ${name},
      caption = ${caption},
      image_category = ${imageCategory},
      asset_role = ${assetRole},
      feature = ${feature},
      usage_context = ${usageContext},
      asset_status = ${assetStatus}
    WHERE id = ${assetId}::uuid
    RETURNING *
  `;
  return json({ asset: rowsToCamel(updated as Record<string, unknown>[])[0] });
};

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
