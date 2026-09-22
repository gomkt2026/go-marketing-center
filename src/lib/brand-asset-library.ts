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

const ROLES_BY_SLUG: Record<string, { value: BrandAssetRole; label: string }[]> = {
  homigo: [
    { value: 'landlord', label: '房東' },
    { value: 'tenant', label: '房客' },
    { value: 'operator', label: '包租代管／管理者' },
    { value: 'staff', label: '租賃管理人員' },
    { value: 'public', label: '一般使用者' },
    { value: 'brand', label: '品牌' },
    { value: 'none', label: '不適用' },
  ],
  taskgo: [
    { value: 'crew', label: '工班／師傅' },
    { value: 'client', label: '業主' },
    { value: 'shop', label: '工程行' },
    { value: 'staff', label: '內勤／調度' },
    { value: 'public', label: '一般使用者' },
    { value: 'brand', label: '品牌' },
    { value: 'none', label: '不適用' },
  ],
  washgo: [
    { value: 'customer', label: '顧客' },
    { value: 'shop_owner', label: '店主' },
    { value: 'driver', label: '司機' },
    { value: 'staff', label: '門市人員' },
    { value: 'public', label: '一般使用者' },
    { value: 'brand', label: '品牌' },
    { value: 'none', label: '不適用' },
  ],
};

const GENERIC_ROLES: { value: BrandAssetRole; label: string }[] = [
  { value: 'staff', label: '內部人員' },
  { value: 'public', label: '一般使用者' },
  { value: 'brand', label: '品牌' },
  { value: 'none', label: '不適用' },
];

export function featuresForBrand(slug: string): string[] {
  return FEATURES_BY_SLUG[slug] ?? ['產品功能', '操作畫面', '現場', ...SHARED_FEATURES];
}

export function rolesForBrand(slug: string): { value: BrandAssetRole; label: string }[] {
  return ROLES_BY_SLUG[slug] ?? GENERIC_ROLES;
}

export function fallbackTaxonomy(slug: string): BrandAssetTaxonomy {
  return {
    categories: IMAGE_CATEGORY_OPTIONS,
    roles: rolesForBrand(slug),
    features: featuresForBrand(slug),
    statuses: ASSET_STATUS_OPTIONS,
  };
}

export const imageCategoryLabel: Record<string, string> = Object.fromEntries(
  IMAGE_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

export const assetStatusLabel: Record<string, string> = Object.fromEntries(
  ASSET_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export function roleLabel(slug: string, role: string | null | undefined): string | null {
  if (!role) return null;
  return rolesForBrand(slug).find((item) => item.value === role)?.label ?? role;
}

export function assetStatusTone(status: string | null | undefined): 'primary' | 'secondary' | 'default' {
  if (status === 'legacy') return 'secondary';
  if (status === 'disabled') return 'default';
  return 'primary';
}

export function libraryCopy(slug: string): { name: string; usage: string; caption: string } {
  if (slug === 'homigo') {
    return {
      name: '素材名稱，例如：報修案件詳情',
      usage: '畫面用途，例如：案件進度',
      caption: '素材說明：這張圖在表達什麼？例如：房東查看租客報修案件、目前處理狀態與相關紀錄。',
    };
  }
  if (slug === 'taskgo') {
    return {
      name: '素材名稱，例如：場勘回報',
      usage: '畫面用途，例如：今日進度',
      caption: '素材說明：這張圖在表達什麼？例如：工班頭查看各案場今天做到哪、照片與待辦。',
    };
  }
  if (slug === 'washgo') {
    return {
      name: '素材名稱，例如：送洗履歷',
      usage: '畫面用途，例如：衣物進度',
      caption: '素材說明：這張圖在表達什麼？例如：店主核對這件衣服的送洗履歷與目前狀態。',
    };
  }
  return {
    name: '素材名稱，例如：主畫面總覽',
    usage: '畫面用途，例如：操作流程',
    caption: '素材說明：這張圖在表達什麼？請用這個品牌自己的場景來寫，不要套用其他品牌的功能名稱。',
  };
}
