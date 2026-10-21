import type { Env } from './env';

/**
 * TaskGo 產品短片與截圖。
 * 影片與截圖放在 public/brands/taskgo/films/，打開品牌素材庫時寫進 brand_assets。
 * 截圖標成系統畫面，FB／IG／Threads 與官網長文才會拿去用。
 * 畫面裡的案名、件數、金額、距離、公司名稱都是示範，不可寫成真實業績。
 */

export const TASKGO_FILM_DEMO_LIMIT =
  '畫面中的案名、件數、金額、距離、公司名稱與評價都是示範，不可寫成真實客戶、業績、滿意度或媒體成效。不要叫人私訊。';

export interface TaskgoFilmStill {
  id: string;
  filmId: string;
  name: string;
  fileUrl: string;
  feature: string;
  role: 'shop' | 'staff' | 'crew' | 'client';
  usageContext: string;
  caption: string;
}

export interface TaskgoFilmSeoTopic {
  topic: string;
  angle: string;
  primaryKeyword: string;
  relatedTerms: string[];
  category: 'product';
  searchIntent: 'solution' | 'informational';
  audience: 'merchant';
  feature: string;
}

const DEMO = TASKGO_FILM_DEMO_LIMIT;

export const TASKGO_FILM_STILLS: TaskgoFilmStill[] = [
  {
    id: 'attendance-dashboard',
    filmId: 'attendance',
    name: '打卡出勤｜專案儀表板',
    fileUrl: '/brands/taskgo/films/stills/attendance-dashboard.jpg',
    feature: '打卡出勤',
    role: 'shop',
    usageContext: '看哪個案子落後',
    caption: `TaskGo 專案儀表板。燈號分成有問題、要注意、正常，旁邊是修繕案件進度。打開就能看出哪個案子落後、哪個任務延誤。${DEMO}`,
  },
  {
    id: 'attendance-daily',
    filmId: 'attendance',
    name: '打卡出勤｜每日報表',
    fileUrl: '/brands/taskgo/films/stills/attendance-daily.jpg',
    feature: '打卡出勤',
    role: 'shop',
    usageContext: '今天完成什麼',
    caption: `每日專案進度彙整。每個專案列出完成任務數、照片張數、打卡次數，今天做到哪、拍了哪些照片一次看完。${DEMO}`,
  },
  {
    id: 'attendance-gps',
    filmId: 'attendance',
    name: '打卡出勤｜GPS 距離警示',
    fileUrl: '/brands/taskgo/films/stills/attendance-gps.jpg',
    feature: '打卡出勤',
    role: 'staff',
    usageContext: '出勤與距離警示',
    caption: `工班出勤報表列出進場、離場、時數、專案、任務與距離。打卡離案場太遠會出現距離警示；超過時數未打離場可自動產生紀錄。報表可匯出 Excel、PDF。師傅用 LINE 打卡並帶 GPS。${DEMO}`,
  },
  {
    id: 'closeout-photos',
    filmId: 'closeout',
    name: '結案報告｜施工照片',
    fileUrl: '/brands/taskgo/films/stills/closeout-photos.jpg',
    feature: '結案報告',
    role: 'client',
    usageContext: '完工照片整理',
    caption: `結案報告把施工照片與影片整理在同一頁，可以下載，不用再從對話裡一張一張翻。${DEMO}`,
  },
  {
    id: 'closeout-vendor',
    filmId: 'closeout',
    name: '結案報告｜服務單位',
    fileUrl: '/brands/taskgo/films/stills/closeout-vendor.jpg',
    feature: '結案報告',
    role: 'client',
    usageContext: '報告附上服務單位',
    caption: `施工結案報告附服務單位：公司名稱、聯絡電話、地址與公司簡介。完工後整理成一份報告給客戶看。${DEMO}`,
  },
  {
    id: 'field-progress',
    filmId: 'field',
    name: '現場管理｜本月任務',
    fileUrl: '/brands/taskgo/films/stills/field-progress.jpg',
    feature: '現場管理',
    role: 'crew',
    usageContext: '手機看進度',
    caption: `TaskGo 手機現場管理的進度頁。本月任務分成進行中、待派工、已完成。行程用顏色區分待派工、已派工、進行中、已完成、待確認。同一支手機還能切照片、錄音、簽名、請款。${DEMO}`,
  },
  {
    id: 'field-photos',
    filmId: 'field',
    name: '現場管理｜現場照片',
    fileUrl: '/brands/taskgo/films/stills/field-photos.jpg',
    feature: '現場管理',
    role: 'crew',
    usageContext: '手機調出現場照',
    caption: `手機現場管理可直接打開這個案場的現場照片，不用再跟工班要圖。上方可切進度、錄音、簽名、請款。${DEMO}`,
  },
  {
    id: 'field-billing',
    filmId: 'field',
    name: '現場管理｜請款收款',
    fileUrl: '/brands/taskgo/films/stills/field-billing.jpg',
    feature: '現場管理',
    role: 'shop',
    usageContext: '看已收與待收',
    caption: `手機請款頁列出合約、成本、已收款、待收款、收款進度與預期損益。金額是產品示範畫面。${DEMO}`,
  },
  {
    id: 'map-pins',
    filmId: 'map',
    name: '專案地圖｜點圖釘',
    fileUrl: '/brands/taskgo/films/stills/map-pins.jpg',
    feature: '專案地圖',
    role: 'staff',
    usageContext: '地圖找案件',
    caption: `TaskGo 專案地圖把修繕案場放在地圖上。點圖釘就跳出這筆案件，不用在對話裡問人在哪、案子做到哪。${DEMO}`,
  },
  {
    id: 'map-photos',
    filmId: 'map',
    name: '專案地圖｜施工照片',
    fileUrl: '/brands/taskgo/films/stills/map-photos.jpg',
    feature: '專案地圖',
    role: 'staff',
    usageContext: '地圖上直接看照片',
    caption: `在專案地圖點開修繕案件，就能看到場勘與施工照片，不用再問照片在哪。${DEMO}`,
  },
  {
    id: 'map-vans',
    filmId: 'map',
    name: '專案地圖｜維修車',
    fileUrl: '/brands/taskgo/films/stills/map-vans.jpg',
    feature: '專案地圖',
    role: 'staff',
    usageContext: '看維修車位置',
    caption: `專案地圖用不同顏色區分專案、修繕、已完成、24 小時內有動態，以及維修車正在前往服務。${DEMO}`,
  },
];

export const TASKGO_FILM_VIDEOS: {
  id: string;
  name: string;
  fileUrl: string;
  feature: string;
  caption: string;
}[] = [
  {
    id: 'attendance',
    name: '產品短片｜打卡出勤',
    fileUrl: '/brands/taskgo/films/attendance.mp4',
    feature: '打卡出勤',
    caption: '67 秒。工班有沒有到場、外包已讀不回、月底算薪水靠猜。TaskGo 用 LINE 打卡加 GPS，儀表板、每日報表、出勤報表與距離警示，並可匯出 Excel、PDF。',
  },
  {
    id: 'closeout',
    name: '產品短片｜結案報告',
    fileUrl: '/brands/taskgo/films/closeout.mp4',
    feature: '結案報告',
    caption: '62 秒。完工不再只丟幾張照片。結案報告整理施工照片、影片與服務單位資訊，可傳到客戶 LINE。',
  },
  {
    id: 'field',
    name: '產品短片｜現場管理',
    fileUrl: '/brands/taskgo/films/field.mp4',
    feature: '現場管理',
    caption: '44 秒。手機現場管理：現場照片、本月任務進度、錄音、簽名，以及請款的已收與待收。',
  },
  {
    id: 'map',
    name: '產品短片｜專案地圖',
    fileUrl: '/brands/taskgo/films/map.mp4',
    feature: '專案地圖',
    caption: '38 秒。專案地圖把案場與修繕釘在地圖上，點一下看案件與施工照片，也看得到維修車位置。',
  },
];

export const TASKGO_FILM_SEO_TOPICS: TaskgoFilmSeoTopic[] = [
  {
    feature: '打卡出勤',
    topic: '工班出勤怎麼算？LINE 打卡、每日報表與 GPS 距離警示',
    angle: '對準工程行搜「工班出勤」。寫 LINE 打卡、GPS、專案儀表板燈號、每日報表（任務、照片、打卡）、出勤報表與離場太遠警示、匯出 Excel／PDF。先回答怎麼算，最後才 CTA。畫面數字是示範，不可寫成真實出勤或業績。',
    primaryKeyword: '工班出勤',
    relatedTerms: ['LINE 打卡', 'GPS 打卡', '每日報表', '出勤報表', '距離警示', 'Excel', '工地管理', '外包'],
    category: 'product',
    searchIntent: 'solution',
    audience: 'merchant',
  },
  {
    feature: '結案報告',
    topic: '工程結案報告要附什麼？照片、進度與服務單位',
    angle: '對準「工程結案報告」。寫完工後把施工照片、影片、每日工序與服務單位整理成一份報告，可傳到客戶 LINE。不可把示範對話裡的評價寫成真實滿意度，也不可發明介紹成交數。',
    primaryKeyword: '工程結案報告',
    relatedTerms: ['施工照片', '結案', '服務單位', '每日進度', 'LINE', '完工', '防水', '客戶'],
    category: 'product',
    searchIntent: 'informational',
    audience: 'merchant',
  },
  {
    feature: '現場管理',
    topic: '工地現場管理用手機怎麼看？照片、進度、簽名與請款',
    angle: '對準「工地現場管理」。寫手機上看現場照片、本月任務（待派工、進行中、已完成）、錄音、簽名與請款的已收待收。金額是示範，不可寫成真實毛利或合約金額。',
    primaryKeyword: '工地現場管理',
    relatedTerms: ['手機', '現場照片', '任務進度', '簽名', '請款', '待派工', '已完成', '工班'],
    category: 'product',
    searchIntent: 'solution',
    audience: 'merchant',
  },
  {
    feature: '專案地圖',
    topic: '工程專案地圖怎麼用？案場、修繕照片與維修車一次看',
    angle: '對準「工程專案地圖」。寫案場與修繕釘在地圖上、點圖釘看案件、直接看施工照片、維修車位置。不可發明車隊數量或服務範圍。',
    primaryKeyword: '工程專案地圖',
    relatedTerms: ['案場地圖', '修繕', '施工照片', '維修車', '圖釘', '派工', '場勘', '進度'],
    category: 'product',
    searchIntent: 'solution',
    audience: 'merchant',
  },
];

export function taskgoProductFilmFacts(): string {
  return [
    '產品短片可寫的能力（數字與案名都是示範，不可當業績）:',
    '打卡出勤: 師傅用 LINE 打卡並帶 GPS。專案儀表板用燈號看落後、注意、正常。每日報表看今天完成的任務、照片與打卡。出勤報表看進場離場與時數，打卡離案場太遠會警示，可匯出 Excel、PDF。',
    '結案報告: 完工把施工照片、影片與服務單位（公司名稱、電話、地址、簡介）整理成一份報告，可給客戶看。不可把片中對話的星等寫成真實滿意度。',
    '現場管理: 手機看現場照片、本月任務進度（待派工、進行中、已完成）、錄音、簽名，以及請款頁的合約、成本、已收與待收。金額是示範。',
    '專案地圖: 地圖上看專案與修繕、點圖釘看案件、直接看施工照片，並看到維修車是否正在前往。',
  ].join('\n');
}

export function seoTopicForFilmFeature(feature: string | null | undefined): TaskgoFilmSeoTopic | undefined {
  if (!feature) return undefined;
  return TASKGO_FILM_SEO_TOPICS.find((item) => item.feature === feature);
}

export function filmKeyFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const key = (metadata as { filmKey?: unknown }).filmKey;
  return typeof key === 'string' && key.startsWith('taskgo-film:') ? key : null;
}

let filmAssetsEnsured = false;

/** 把產品短片與截圖 upsert 進 TaskGo 素材庫。可重複執行。 */
export async function ensureTaskgoProductFilmAssets(env: Env): Promise<void> {
  if (filmAssetsEnsured) return;
  const { getSql } = await import('./db');
  const sql = getSql(env);
  const brands = await sql`SELECT id FROM brands WHERE slug = 'taskgo' LIMIT 1`;
  const brandId = (brands[0] as { id?: string } | undefined)?.id;
  if (!brandId) return;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_assets_taskgo_film
    ON brand_assets (brand_id, (metadata->>'filmKey'))
    WHERE metadata->>'filmKey' IS NOT NULL
  `.catch(() => undefined);

  const rows: {
    key: string;
    assetType: 'image' | 'video';
    name: string;
    fileUrl: string;
    imageCategory: string | null;
    caption: string;
    role: string;
    feature: string;
    usageContext: string;
  }[] = [
    ...TASKGO_FILM_STILLS.map((still) => ({
      key: `taskgo-film:still:${still.id}`,
      assetType: 'image' as const,
      name: still.name,
      fileUrl: still.fileUrl,
      imageCategory: 'system_screenshot',
      caption: still.caption,
      role: still.role,
      feature: still.feature,
      usageContext: still.usageContext,
    })),
    ...TASKGO_FILM_VIDEOS.map((film) => ({
      key: `taskgo-film:video:${film.id}`,
      assetType: 'video' as const,
      name: film.name,
      fileUrl: film.fileUrl,
      imageCategory: null,
      caption: film.caption,
      role: 'shop',
      feature: film.feature,
      usageContext: '產品影片介紹',
    })),
  ];

  for (const row of rows) {
    const meta = JSON.stringify({ filmKey: row.key, source: 'taskgo-product-film' });
    const existing = await sql`
      SELECT id FROM brand_assets
      WHERE brand_id = ${brandId}::uuid
        AND metadata->>'filmKey' = ${row.key}
      LIMIT 1
    `;
    const id = (existing[0] as { id?: string } | undefined)?.id;
    const write = async (targetId: string) => {
      await sql`
        UPDATE brand_assets SET
          asset_type = ${row.assetType}::asset_type,
          name = ${row.name},
          file_url = ${row.fileUrl},
          image_category = ${row.imageCategory},
          caption = ${row.caption},
          asset_role = ${row.role},
          feature = ${row.feature},
          usage_context = ${row.usageContext},
          asset_status = 'active',
          metadata = ${meta}::jsonb
        WHERE id = ${targetId}::uuid
      `;
    };
    if (id) {
      await write(id);
    } else {
      try {
        await sql`
          INSERT INTO brand_assets (
            brand_id, asset_type, name, file_url, image_category, caption,
            asset_role, feature, usage_context, asset_status, metadata
          ) VALUES (
            ${brandId}::uuid, ${row.assetType}::asset_type, ${row.name}, ${row.fileUrl},
            ${row.imageCategory}, ${row.caption}, ${row.role}, ${row.feature},
            ${row.usageContext}, 'active', ${meta}::jsonb
          )
        `;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/duplicate|unique/i.test(msg)) throw e;
        const again = await sql`
          SELECT id FROM brand_assets
          WHERE brand_id = ${brandId}::uuid
            AND metadata->>'filmKey' = ${row.key}
          LIMIT 1
        `;
        const againId = (again[0] as { id?: string } | undefined)?.id;
        if (!againId) throw e;
        await write(againId);
      }
    }
  }
  filmAssetsEnsured = true;
}
