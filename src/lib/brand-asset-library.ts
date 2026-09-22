import type {
  BrandAssetImageCategory, BrandAssetRole, BrandAssetStatus, BrandAssetTaxonomy,
} from '@/types';

export const IMAGE_CATEGORY_OPTIONS: { value: BrandAssetImageCategory; label: string }[] = [
  { value: 'system_screenshot', label: '系統畫面截圖' },
  { value: 'real_photo', label: '實際拍攝照片' },
  { value: 'people', label: '人物照片' },
  { value: 'scene', label: '場景照片' },
  { value: 'brand_collab', label: '合作品牌照片' },
  { value: 'press_clipping', label: '見報截圖' },
  { value: 'brand_identity', label: '品牌素材' },
  { value: 'other', label: '其他' },
];

export const ASSET_ROLE_OPTIONS: { value: BrandAssetRole; label: string }[] = [
  { value: 'landlord', label: '房東' },
  { value: 'tenant', label: '房客' },
  { value: 'operator', label: '包租代管／管理者' },
  { value: 'staff', label: '租賃管理人員' },
  { value: 'public', label: '一般使用者' },
  { value: 'brand', label: '品牌' },
  { value: 'none', label: '不適用' },
];

export const ASSET_STATUS_OPTIONS: { value: BrandAssetStatus; label: string }[] = [
  { value: 'active', label: '現行' },
  { value: 'legacy', label: '舊版' },
  { value: 'disabled', label: '停用' },
];

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

export function fallbackTaxonomy(slug: string): BrandAssetTaxonomy {
  return {
    categories: IMAGE_CATEGORY_OPTIONS,
    roles: ASSET_ROLE_OPTIONS,
    features: featuresForBrand(slug),
    statuses: ASSET_STATUS_OPTIONS,
  };
}

export const imageCategoryLabel: Record<string, string> = Object.fromEntries(
  IMAGE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

export const assetRoleLabel: Record<string, string> = Object.fromEntries(
  ASSET_ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

export const assetStatusLabel: Record<string, string> = Object.fromEntries(
  ASSET_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export function assetStatusTone(status: string | null | undefined): 'primary' | 'secondary' | 'default' {
  if (status === 'legacy') return 'secondary';
  if (status === 'disabled') return 'default';
  return 'primary';
}
