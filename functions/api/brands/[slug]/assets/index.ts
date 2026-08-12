import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { rowsToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { buildBrandLibraryKey, putMedia } from '../../../../_shared/media';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_IMAGE_CATEGORIES = ['system_screenshot', 'real_photo', 'people', 'scene', 'brand_collab', 'other'];
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

// GET /api/brands/:slug/assets:品牌智慧圖片素材庫列表(asset_type = image)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_assets
    WHERE brand_id = ${brand.id}::uuid AND asset_type = 'image'
    ORDER BY created_at DESC
  `;
  return json({ assets: rowsToCamel(rows as Record<string, unknown>[]) });
};

// POST /api/brands/:slug/assets:上傳圖片素材(系統畫面截圖/實拍照片/人物/場景/合作品牌照片)
// multipart form: file(圖片)、caption(選填)、imageCategory(選填)
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
  const caption = String(form.get('caption') ?? '').trim();
  const imageCategoryRaw = String(form.get('imageCategory') ?? '').trim();
  const imageCategory = VALID_IMAGE_CATEGORIES.includes(imageCategoryRaw) ? imageCategoryRaw : null;

  if (!file || typeof file === 'string') return error('請上傳圖片檔(jpg / png / webp / gif)', 400);
  const imageFile = file as File;
  if (imageFile.size === 0) return error('圖片是空的', 400);
  if (imageFile.size > MAX_IMAGE_SIZE) return error('圖片過大,請壓在 10MB 以內', 400);

  const contentType = imageFile.type || 'image/jpeg';
  const ext = EXT_BY_MIME[contentType] ?? 'jpg';
  if (!contentType.startsWith('image/')) return error('請上傳圖片檔(jpg / png / webp / gif)', 400);

  const key = buildBrandLibraryKey(brand.slug, ext);
  const fileUrl = await putMedia(context.env, key, new Uint8Array(await imageFile.arrayBuffer()), contentType);

  const sql = getSql(context.env);
  const rows = await sql`
    INSERT INTO brand_assets (brand_id, asset_type, name, file_url, image_category, caption, uploaded_by)
    VALUES (${brand.id}::uuid, 'image', ${imageFile.name || '素材圖片'}, ${fileUrl}, ${imageCategory}, ${caption || null}, ${auth.id}::uuid)
    RETURNING *
  `;
  return json({ asset: rowsToCamel(rows as Record<string, unknown>[])[0] }, 201);
};
