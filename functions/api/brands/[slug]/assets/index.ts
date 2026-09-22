import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { rowsToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { buildBrandLibraryKey, putMedia } from '../../../../_shared/media';
import {
  assetTaxonomy,
  ensureBrandAssetLibrary,
  isAssetRole,
  isAssetStatus,
  isImageCategory,
} from '../../../../_shared/brand-assets';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

function matchesQuery(asset: Record<string, unknown>, q: string): boolean {
  const hay = [asset.name, asset.caption, asset.feature, asset.usageContext]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

// GET /api/brands/:slug/assets:品牌智慧圖片素材庫列表(asset_type = image)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  await ensureBrandAssetLibrary(context.env).catch(() => undefined);
  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim().toLowerCase() ?? '';
  const imageCategory = url.searchParams.get('imageCategory')?.trim() ?? '';
  const role = url.searchParams.get('role')?.trim() ?? '';
  const feature = url.searchParams.get('feature')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_assets
    WHERE brand_id = ${brand.id}::uuid AND asset_type = 'image'
    ORDER BY created_at DESC
  `;
  const assets = rowsToCamel(rows as Record<string, unknown>[]).filter((asset) => {
    const assetStatus = String(asset.assetStatus ?? 'active');
    if (status && status !== 'all' && assetStatus !== status) return false;
    if (imageCategory && asset.imageCategory !== imageCategory) return false;
    if (role && asset.assetRole !== role) return false;
    if (feature && asset.feature !== feature) return false;
    if (q && !matchesQuery(asset, q)) return false;
    return true;
  });
  return json({ assets, taxonomy: assetTaxonomy(slug) });
};

// POST /api/brands/:slug/assets:上傳圖片素材
// multipart: file、name、caption、imageCategory、assetRole、feature、usageContext、assetStatus
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return error('請用 multipart/form-data 上傳', 400);
  }

  const file = form.get('file');
  const name = String(form.get('name') ?? '').trim();
  const caption = String(form.get('caption') ?? '').trim();
  const imageCategoryRaw = String(form.get('imageCategory') ?? '').trim();
  const imageCategory = isImageCategory(imageCategoryRaw) ? imageCategoryRaw : null;
  const roleRaw = String(form.get('assetRole') ?? '').trim();
  const assetRole = isAssetRole(roleRaw) ? roleRaw : null;
  const feature = String(form.get('feature') ?? '').trim() || null;
  const usageContext = String(form.get('usageContext') ?? '').trim() || null;
  const statusRaw = String(form.get('assetStatus') ?? 'active').trim();
  const assetStatus = isAssetStatus(statusRaw) ? statusRaw : 'active';

  if (!file || typeof file === 'string') return error('請上傳圖片檔(jpg / png / webp / gif)', 400);
  const imageFile = file as File;
  if (imageFile.size === 0) return error('圖片是空的', 400);
  if (imageFile.size > MAX_IMAGE_SIZE) return error('圖片過大,請壓在 10MB 以內', 400);

  const contentType = imageFile.type || 'image/jpeg';
  const ext = EXT_BY_MIME[contentType] ?? 'jpg';
  if (!contentType.startsWith('image/')) return error('請上傳圖片檔(jpg / png / webp / gif)', 400);

  const key = buildBrandLibraryKey(brand.slug, ext);
  const fileUrl = await putMedia(context.env, key, new Uint8Array(await imageFile.arrayBuffer()), contentType);

  await ensureBrandAssetLibrary(context.env).catch(() => undefined);
  const sql = getSql(context.env);
  const rows = await sql`
    INSERT INTO brand_assets (
      brand_id, asset_type, name, file_url, image_category, caption,
      asset_role, feature, usage_context, asset_status, uploaded_by
    )
    VALUES (
      ${brand.id}::uuid, 'image', ${name || imageFile.name || '素材圖片'}, ${fileUrl},
      ${imageCategory}, ${caption || null}, ${assetRole}, ${feature}, ${usageContext},
      ${assetStatus}, ${auth.id}::uuid
    )
    RETURNING *
  `;
  return json({ asset: rowsToCamel(rows as Record<string, unknown>[])[0], taxonomy: assetTaxonomy(slug) }, 201);
};
