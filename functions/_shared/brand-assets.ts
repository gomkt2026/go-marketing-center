import type { Env } from './env';
import { getSql } from './db';
import { toPublicMediaUrl } from './media';

export const IMAGE_CATEGORIES = [
  'system_screenshot',
  'real_photo',
  'people',
  'scene',
  'brand_collab',
  'press_clipping',
  'brand_identity',
  'other',
] as const;

export type BrandAssetImageCategory = (typeof IMAGE_CATEGORIES)[number];

export const IMAGE_CATEGORY_LABEL: Record<BrandAssetImageCategory, string> = {
  system_screenshot: '系統畫面截圖',
  real_photo: '實際拍攝照片',
  people: '人物照片',
  scene: '場景照片',
  brand_collab: '合作品牌照片',
  press_clipping: '見報截圖',
  brand_identity: '品牌素材',
  other: '其他',
};

export const ASSET_ROLES = ['landlord', 'tenant', 'operator', 'staff', 'public', 'brand', 'none'] as const;
export type BrandAssetRole = (typeof ASSET_ROLES)[number];

export const ASSET_ROLE_LABEL: Record<BrandAssetRole, string> = {
  landlord: '房東',
  tenant: '房客',
  operator: '包租代管／管理者',
  staff: '租賃管理人員',
  public: '一般使用者',
  brand: '品牌',
  none: '不適用',
};

export const ASSET_STATUSES = ['active', 'legacy', 'disabled'] as const;
export type BrandAssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS_LABEL: Record<BrandAssetStatus, string> = {
  active: '現行',
  legacy: '舊版',
  disabled: '停用',
};

const SHARED_FEATURES = ['品牌', '其他'];

const FEATURES_BY_SLUG: Record<string, string[]> = {
  homigo: [
    '租金管理', '繳租回報', '合約', '報修', '入住', '退租', '點交',
    '房屋紀錄', '找房', '帳務', '待辦', '管理總覽', ...SHARED_FEATURES,
  ],
  taskgo: [
    '場勘', '報價', '派工', '驗收', '請款', '修繕', '工班', '案場', '進度', ...SHARED_FEATURES,
  ],
  washgo: [
    '收送', '洗程', '點數', '報價', '門市', '司機', '顧客', '進件', ...SHARED_FEATURES,
  ],
};

export function featuresForBrand(slug: string): string[] {
  return FEATURES_BY_SLUG[slug] ?? ['產品功能', '操作畫面', '現場', ...SHARED_FEATURES];
}

export function isImageCategory(value: string | null | undefined): value is BrandAssetImageCategory {
  return !!value && (IMAGE_CATEGORIES as readonly string[]).includes(value);
}

export function isAssetRole(value: string | null | undefined): value is BrandAssetRole {
  return !!value && (ASSET_ROLES as readonly string[]).includes(value);
}

export function isAssetStatus(value: string | null | undefined): value is BrandAssetStatus {
  return !!value && (ASSET_STATUSES as readonly string[]).includes(value);
}

export function assetTaxonomy(slug: string) {
  return {
    categories: IMAGE_CATEGORIES.map((value) => ({ value, label: IMAGE_CATEGORY_LABEL[value] })),
    roles: ASSET_ROLES.map((value) => ({ value, label: ASSET_ROLE_LABEL[value] })),
    features: featuresForBrand(slug),
    statuses: ASSET_STATUSES.map((value) => ({ value, label: ASSET_STATUS_LABEL[value] })),
  };
}

let assetLibraryEnsured = false;

export async function ensureBrandAssetLibrary(env: Env): Promise<void> {
  if (assetLibraryEnsured) return;
  const sql = getSql(env);
  try {
    await sql`SELECT asset_role, feature, usage_context, asset_status FROM brand_assets LIMIT 1`;
    await sql`ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_image_category_check`;
    await sql`
      ALTER TABLE brand_assets
        ADD CONSTRAINT brand_assets_image_category_check
        CHECK (image_category IS NULL OR image_category IN (
          'system_screenshot', 'real_photo', 'people', 'scene',
          'brand_collab', 'press_clipping', 'brand_identity', 'other'
        ))
    `;
    assetLibraryEnsured = true;
    return;
  } catch {
    /* 欄位尚未建立,往下做一次性 migration */
  }
  await sql`
    ALTER TABLE brand_assets
      ADD COLUMN IF NOT EXISTS asset_role TEXT,
      ADD COLUMN IF NOT EXISTS feature TEXT,
      ADD COLUMN IF NOT EXISTS usage_context TEXT,
      ADD COLUMN IF NOT EXISTS asset_status TEXT
  `;
  await sql`
    UPDATE brand_assets
    SET asset_status = 'active'
    WHERE asset_status IS NULL OR asset_status = ''
  `;
  await sql`ALTER TABLE brand_assets ALTER COLUMN asset_status SET DEFAULT 'active'`;
  await sql`ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_image_category_check`;
  await sql`
    ALTER TABLE brand_assets
      ADD CONSTRAINT brand_assets_image_category_check
      CHECK (image_category IS NULL OR image_category IN (
        'system_screenshot', 'real_photo', 'people', 'scene',
        'brand_collab', 'press_clipping', 'brand_identity', 'other'
      ))
  `;
  await sql`ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_asset_role_check`;
  await sql`
    ALTER TABLE brand_assets
      ADD CONSTRAINT brand_assets_asset_role_check
      CHECK (asset_role IS NULL OR asset_role IN (
        'landlord', 'tenant', 'operator', 'staff', 'public', 'brand', 'none'
      ))
  `;
  await sql`ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_asset_status_check`;
  await sql`
    ALTER TABLE brand_assets
      ADD CONSTRAINT brand_assets_asset_status_check
      CHECK (asset_status IS NULL OR asset_status IN ('active', 'legacy', 'disabled'))
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_brand_assets_library_search
    ON brand_assets(brand_id, asset_status, image_category)
    WHERE asset_type = 'image'
  `;
  assetLibraryEnsured = true;
}

export interface BrandAssetPick {
  id: string;
  fileUrl: string;
  name: string | null;
  caption: string | null;
  imageCategory: string | null;
  assetRole: string | null;
  feature: string | null;
  usageContext: string | null;
  assetStatus: string | null;
}

export interface PickBrandAssetQuery {
  preferScreenshot?: boolean;
  query?: string;
  role?: string;
  feature?: string;
  usageContext?: string;
  includeLegacy?: boolean;
  includeBrandIdentity?: boolean;
}

type AssetRow = {
  id: string;
  name?: string | null;
  file_url: string | null;
  caption: string | null;
  image_category: string | null;
  asset_role?: string | null;
  feature?: string | null;
  usage_context?: string | null;
  asset_status?: string | null;
};

function toAssetPick(env: Env, row: AssetRow): BrandAssetPick | null {
  const fileUrl = toPublicMediaUrl(env, row.file_url);
  if (!fileUrl) return null;
  return {
    id: row.id,
    fileUrl,
    name: row.name ?? null,
    caption: row.caption,
    imageCategory: row.image_category,
    assetRole: row.asset_role ?? null,
    feature: row.feature ?? null,
    usageContext: row.usage_context ?? null,
    assetStatus: row.asset_status ?? 'active',
  };
}

function matchScore(row: AssetRow, opts: PickBrandAssetQuery): number {
  let score = 0;
  const q = opts.query?.trim().toLowerCase();
  const hay = [row.name, row.caption, row.feature, row.usage_context, row.image_category]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (opts.feature && row.feature === opts.feature) score += 8;
  else if (opts.feature && row.feature && row.feature.includes(opts.feature)) score += 5;
  if (opts.usageContext && row.usage_context) {
    if (row.usage_context === opts.usageContext) score += 6;
    else if (row.usage_context.includes(opts.usageContext) || opts.usageContext.includes(row.usage_context)) score += 4;
  }
  if (opts.role && row.asset_role && row.asset_role === opts.role) score += 4;
  if (q) {
    if (hay.includes(q)) score += 5;
    for (const token of q.split(/[\s/、,，]+/).filter((t) => t.length >= 2)) {
      if (hay.includes(token)) score += 2;
    }
  }
  if (opts.preferScreenshot && row.image_category === 'system_screenshot') score += 3;
  else if (!opts.preferScreenshot) {
    if (row.image_category === 'real_photo') score += 2;
    if (row.image_category === 'scene' || row.image_category === 'people') score += 1;
  }
  return score;
}

function isUsableForAi(row: AssetRow, opts: PickBrandAssetQuery): boolean {
  const status = row.asset_status || 'active';
  if (status === 'disabled') return false;
  if (status === 'legacy' && !opts.includeLegacy) return false;
  if (row.image_category === 'brand_identity' && !opts.includeBrandIdentity) return false;
  return true;
}

export async function searchBrandAssets(
  env: Env,
  brandId: string,
  opts: PickBrandAssetQuery = {},
): Promise<BrandAssetPick[]> {
  await ensureBrandAssetLibrary(env).catch(() => undefined);
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, name, file_url, caption, image_category, asset_role, feature, usage_context, asset_status,
           used_in_threads_count, last_used_at
    FROM brand_assets
    WHERE brand_id = ${brandId}::uuid AND asset_type = 'image'
    ORDER BY used_in_threads_count ASC, last_used_at ASC NULLS FIRST
  `.catch(async () => sql`
    SELECT id, name, file_url, caption, image_category
    FROM brand_assets
    WHERE brand_id = ${brandId}::uuid AND asset_type = 'image'
    ORDER BY used_in_threads_count ASC, last_used_at ASC NULLS FIRST
  `) as AssetRow[];

  return rows
    .filter((row) => isUsableForAi(row, opts))
    .filter((row) => !opts.preferScreenshot || row.image_category === 'system_screenshot')
    .map((row) => ({ row, score: matchScore(row, opts) }))
    .sort((a, b) => b.score - a.score)
    .map(({ row }) => toAssetPick(env, row))
    .filter((item): item is BrandAssetPick => !!item);
}

export async function pickBrandAsset(
  env: Env,
  brandId: string,
  preferScreenshotOrOpts: boolean | PickBrandAssetQuery = false,
): Promise<BrandAssetPick | null> {
  const opts: PickBrandAssetQuery = typeof preferScreenshotOrOpts === 'boolean'
    ? { preferScreenshot: preferScreenshotOrOpts }
    : preferScreenshotOrOpts;

  const matched = await searchBrandAssets(env, brandId, opts);
  if (matched.length) {
    if (!opts.query && !opts.feature && !opts.usageContext && !opts.role) return matched[0];
    const best = matched[0];
    const scored = matchScore({
      id: best.id,
      name: best.name,
      file_url: best.fileUrl,
      caption: best.caption,
      image_category: best.imageCategory,
      asset_role: best.assetRole,
      feature: best.feature,
      usage_context: best.usageContext,
      asset_status: best.assetStatus,
    }, opts);
    if (scored > 0 || !opts.preferScreenshot) return best;
  }

  if (opts.preferScreenshot && (opts.query || opts.feature || opts.usageContext || opts.role)) {
    const anyShot = await searchBrandAssets(env, brandId, { preferScreenshot: true });
    return anyShot[0] ?? null;
  }
  return matched[0] ?? null;
}

export async function pickBrandScreenshot(env: Env, brandSlug: string, opts: PickBrandAssetQuery = {}): Promise<BrandAssetPick | null> {
  const sql = getSql(env);
  const brands = await sql`SELECT id FROM brands WHERE slug = ${brandSlug} LIMIT 1`;
  const brandId = (brands[0] as { id?: string } | undefined)?.id;
  if (!brandId) return null;
  return pickBrandAsset(env, brandId, { ...opts, preferScreenshot: true });
}

export async function markAssetUsed(env: Env, assetId: string): Promise<void> {
  const sql = getSql(env);
  await sql`
    UPDATE brand_assets SET used_in_threads_count = used_in_threads_count + 1, last_used_at = now()
    WHERE id = ${assetId}::uuid
  `;
}

export function describeAssetForPrompt(asset: {
  name?: string | null;
  caption?: string | null;
  imageCategory?: string | null;
  assetRole?: string | null;
  feature?: string | null;
  usageContext?: string | null;
}): string {
  const category = asset.imageCategory && isImageCategory(asset.imageCategory)
    ? IMAGE_CATEGORY_LABEL[asset.imageCategory]
    : null;
  const role = asset.assetRole && isAssetRole(asset.assetRole)
    ? ASSET_ROLE_LABEL[asset.assetRole]
    : null;
  return [
    asset.name ? `素材名稱:${asset.name}` : '',
    category ? `類型:${category}` : '',
    role ? `角色:${role}` : '',
    asset.feature ? `功能:${asset.feature}` : '',
    asset.usageContext ? `畫面用途:${asset.usageContext}` : '',
    asset.caption ? `說明:${asset.caption}` : '',
  ].filter(Boolean).join('；');
}
