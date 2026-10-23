import type { Env } from './env';
import { getSql } from './db';
import shortsJson from '../../src/data/system-shorts.json';

/**
 * TaskGo、Washgo 系統短影片（tools/go-shorts/publish.py 產生清單）。
 * 打開品牌素材庫時把影片與每個系統畫面寫進 brand_assets；截圖標成系統畫面並優先拿去發 FB／IG。
 * 用這些截圖產的 IG 與 Threads 貼文會直接附上短影片（IG Reels、Threads 影片），FB 用截圖。
 * 畫面是客戶真實帳號，個資已馬賽克，件數與金額不可寫成業績。
 */

export interface SystemShortStill {
  id: string;
  file: string;
  tag: string;
  label: string;
  caption: string;
}

export interface SystemShort {
  id: string;
  brand: 'taskgo' | 'washgo';
  episode: string;
  feature: string;
  title: string;
  tagline: string;
  duration: number;
  durationLabel: string;
  video: string;
  poster: string;
  role: string;
  pain: string[];
  chips: string[];
  summary: string;
  ytTitle: string;
  ig: string;
  threads: string;
  stills: SystemShortStill[];
}

export const SYSTEM_SHORTS = shortsJson as SystemShort[];

export const SYSTEM_SHORT_ASSET_PREFIX = '系統短影片｜';

export const SYSTEM_SHORT_LIMIT =
  '畫面是客戶真實帳號錄的系統操作，姓名、電話、地址已遮掉。畫面裡的件數、金額、會員數、案名與公司名稱都不可寫進文案，也不可寫成業績、客戶數或成效。不要叫人私訊。';

const KEY_PREFIX = 'go-short:';

export function shortsForBrand(slug: string): SystemShort[] {
  return SYSTEM_SHORTS.filter((item) => item.brand === slug);
}

export function systemShortFeatures(slug: string): string[] {
  return [...new Set(shortsForBrand(slug).map((item) => item.feature))];
}

export function systemShortById(slug: string, id: string): SystemShort | undefined {
  return SYSTEM_SHORTS.find((item) => item.brand === slug && item.id === id);
}

/** 素材 metadata 是系統短影片時回傳那一集 */
export function systemShortFromMetadata(metadata: unknown): SystemShort | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const { filmKey, shortId, brand } = metadata as { filmKey?: unknown; shortId?: unknown; brand?: unknown };
  if (typeof filmKey !== 'string' || !filmKey.startsWith(KEY_PREFIX)) return undefined;
  if (typeof shortId !== 'string' || typeof brand !== 'string') return undefined;
  return systemShortById(brand, shortId);
}

/** 素材名稱是「系統短影片｜功能｜畫面」時回傳那一集 */
export function systemShortFromAssetName(slug: string, name: string | null | undefined): SystemShort | undefined {
  if (!name?.startsWith(SYSTEM_SHORT_ASSET_PREFIX)) return undefined;
  const feature = name.slice(SYSTEM_SHORT_ASSET_PREFIX.length).split('｜')[0];
  return shortsForBrand(slug).find((item) => item.feature === feature);
}

/** 用短影片寫貼文時給 AI 的事實：痛點、每個畫面的旁白、成片附上的文案範例 */
export function systemShortPrompt(short: SystemShort): string {
  return [
    `這篇以「${short.title}」這支 ${short.durationLabel} 的系統短影片為主。${short.tagline}`,
    short.pain.length ? `影片開頭的痛點：${short.pain.join(' ')}` : '',
    '影片裡的系統畫面依序是：',
    ...short.stills.map((still, index) => `${index + 1}. ${still.tag}：${still.caption}`),
    short.chips.length ? `片尾重點：${short.chips.join('、')}` : '',
    'IG 與 Threads 會直接附上這支短影片，文案要讓人想點開看完；FB 附截圖。可以參考成片附的文案，但要重寫，不要照抄：',
    short.threads,
    SYSTEM_SHORT_LIMIT,
  ].filter(Boolean).join('\n');
}

/** 官網長文與 SEO 可寫的能力 */
export function systemShortFacts(slug: string): string {
  const items = shortsForBrand(slug);
  if (!items.length) return '';
  return [
    '系統短影片可寫的能力（畫面是真實帳號，件數、金額、會員數不可當業績）:',
    ...items.map((item) => `${item.feature}: ${item.summary}`),
  ].join('\n');
}

export interface SystemShortSeoTopic {
  topic: string;
  angle: string;
  primaryKeyword: string;
  relatedTerms: string[];
  category: 'product';
  searchIntent: 'solution' | 'informational';
  audience: 'merchant';
  feature: string;
}

const NO_NUMBERS = '畫面數字來自真實帳號，不可寫成業績或客戶數。先回答問題，最後才 CTA。';

export const SYSTEM_SHORT_SEO_TOPICS: Record<string, SystemShortSeoTopic[]> = {
  taskgo: [
    {
      feature: '財務成本',
      topic: '工程案場怎麼算賺賠？收款、成本與毛利即時看',
      angle: `對準「工程專案成本」。寫合約總額、已收待收、總成本、收款提醒與成本超支、廠商派工費用自動入成本。${NO_NUMBERS}`,
      primaryKeyword: '工程專案成本',
      relatedTerms: ['收款', '毛利', '成本分析', '應收帳款', '廠商費用', '超支', '工程行', '專案財務'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '派工行事曆',
      topic: '工班派工怎麼排？行事曆月週日切換、LINE 通知師傅',
      angle: `對準「工班派工」。寫月週日切換、新增派工指定專案與時間、狀態顏色、列表看每日任務、師傅用 LINE 收通知。${NO_NUMBERS}`,
      primaryKeyword: '工班派工',
      relatedTerms: ['派工行事曆', '排班', 'LINE 通知', '師傅', '案場', '工程排程', '撞單', '調度'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '施工回報',
      topic: '施工照片怎麼審核？工班提交、WM 審核、PM 確認三段把關',
      angle: `對準「施工回報」。寫審核資料包自動整理任務照片、分頁看待審、三段審核與 AI 比對。不可發明錯誤率下降多少。${NO_NUMBERS}`,
      primaryKeyword: '施工回報',
      relatedTerms: ['施工照片', '審核', '品質', '工班', '完工', 'AI 比對', '責任歸屬', '驗收'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '老闆駕駛艙',
      topic: '工程公司現況怎麼一眼看懂？專案健康、人力與現金流一頁看',
      angle: `對準「工程管理儀表板」。寫專案健康度、任務交付、人力負荷、品質風險、合約總額、應收、實際成本與預期毛利。${NO_NUMBERS}`,
      primaryKeyword: '工程管理儀表板',
      relatedTerms: ['老闆', '專案健康', '現金流', '人力負荷', '毛利', '異常', '工程公司', '經營'],
      category: 'product', searchIntent: 'informational', audience: 'merchant',
    },
  ],
  washgo: [
    {
      feature: '收件報價',
      topic: '洗衣店收件怎麼報價才不吵架？逐件覆核、報價、簽名再洗',
      angle: `對準「洗衣店報價」。寫門市收件五步驟、拆袋覆核與洗滌風險、逐件報價與加價、客人簽名後才洗。${NO_NUMBERS}`,
      primaryKeyword: '洗衣店報價',
      relatedTerms: ['收件', '覆核', '簽名', '洗滌風險', '加價', '門市', '收件單', '客訴'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '司機任務',
      topic: '洗衣到府收送怎麼派車？派遣清單、待送回與運送行程表',
      angle: `對準「洗衣收送派車」。寫下單、排運費、LINE 通知司機，派遣清單、回貨覆核、待送回分開，行程表可訂閱 Google 日曆。${NO_NUMBERS}`,
      primaryKeyword: '洗衣收送派車',
      relatedTerms: ['到府收送', '司機', '派車', '運費', 'LINE 通知', 'Google 日曆', '漏單', '物流'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '訂單進度',
      topic: '客人一直問衣服洗好沒？洗衣訂單進度查詢與追蹤連結',
      angle: `對準「洗衣訂單查詢」。寫姓名、電話、單號、衣物名稱都能搜，流程進度條、客戶追蹤連結、覆核照片、待取件存放區。${NO_NUMBERS}`,
      primaryKeyword: '洗衣訂單查詢',
      relatedTerms: ['訂單進度', '追蹤連結', '待取件', '覆核照片', '門市', 'LINE', '客人', '查詢'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '品管重洗',
      topic: '洗衣品管怎麼做？對照送洗照片逐件檢查與重洗',
      angle: `對準「洗衣品管」。寫對照送洗照片逐件品檢、通過或需重洗、污點說明告知顧客、貼紙碼快速找品項。${NO_NUMBERS}`,
      primaryKeyword: '洗衣品管',
      relatedTerms: ['品檢', '重洗', '污漬', '送洗照片', '貼紙碼', '客訴', '出貨', '門市'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '點數儲值',
      topic: '洗衣店儲值怎麼管？方案贈點、LINE 儲值與加值報表',
      angle: `對準「洗衣店儲值」。寫儲值方案自動算贈點、客人 LINE 儲值自動入點、櫃檯用電話或 QR 加點、客戶點數餘額與加值報表。${NO_NUMBERS}`,
      primaryKeyword: '洗衣店儲值',
      relatedTerms: ['會員點數', 'LINE Pay', '儲值方案', '贈點', '熟客', '加值報表', '櫃檯', '對帳'],
      category: 'product', searchIntent: 'solution', audience: 'merchant',
    },
    {
      feature: '營運中心',
      topic: '洗衣店開班先看什麼？待處理訂單、卡單提醒一頁看',
      angle: `對準「洗衣店管理系統」。寫系統總覽各狀態訂單、首頁待處理件數、營運中心卡單提醒、訂單依狀態篩選。${NO_NUMBERS}`,
      primaryKeyword: '洗衣店管理系統',
      relatedTerms: ['營運中心', '待處理', '卡單', '訂單狀態', '門市', '開班', '收件', '品管'],
      category: 'product', searchIntent: 'informational', audience: 'merchant',
    },
  ],
};

export function seoTopicForShortFeature(slug: string, feature: string | null | undefined): SystemShortSeoTopic | undefined {
  if (!feature) return undefined;
  return SYSTEM_SHORT_SEO_TOPICS[slug]?.find((item) => item.feature === feature);
}

/**
 * IG、Threads 貼文的配圖來自系統短影片時，附上那支短影片，發布時 IG 走 Reels、Threads 走影片。
 * FB 目前只發圖，不附。
 */
export async function attachSystemShortVideo(
  env: Env,
  params: { versionId: string; platform: string; assetId?: string | null },
): Promise<SystemShort | undefined> {
  if (!params.assetId || (params.platform !== 'instagram' && params.platform !== 'threads')) return undefined;
  const sql = getSql(env);
  const rows = await sql`SELECT metadata FROM brand_assets WHERE id = ${params.assetId}::uuid LIMIT 1`.catch(() => []);
  const short = systemShortFromMetadata((rows[0] as { metadata?: unknown } | undefined)?.metadata);
  if (!short) return undefined;
  await sql`
    INSERT INTO content_assets (content_version_id, asset_type, file_url, metadata)
    VALUES (${params.versionId}::uuid, 'video', ${short.video},
            ${JSON.stringify({ generated: false, source: 'system_short', shortId: short.id, poster: short.poster })})
  `;
  return short;
}

const ensured = new Set<string>();

/** 把系統短影片與截圖 upsert 進該品牌素材庫。可重複執行。 */
export async function ensureSystemShortAssets(env: Env, slug: string): Promise<void> {
  const items = shortsForBrand(slug);
  if (!items.length || ensured.has(slug)) return;
  const sql = getSql(env);
  const brands = await sql`SELECT id FROM brands WHERE slug = ${slug} LIMIT 1`;
  const brandId = (brands[0] as { id?: string } | undefined)?.id;
  if (!brandId) return;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_assets_taskgo_film
    ON brand_assets (brand_id, (metadata->>'filmKey'))
    WHERE metadata->>'filmKey' IS NOT NULL
  `.catch(() => undefined);

  const rows = items.flatMap((short) => [
    {
      key: `${KEY_PREFIX}${slug}:video:${short.id}`,
      shortId: short.id,
      assetType: 'video' as const,
      name: `${SYSTEM_SHORT_ASSET_PREFIX}${short.feature}`,
      fileUrl: short.video,
      imageCategory: null,
      caption: `${short.durationLabel}。${short.summary}`,
      role: short.role,
      feature: short.feature,
      usageContext: '系統短影片',
    },
    ...short.stills.map((still) => ({
      key: `${KEY_PREFIX}${slug}:still:${still.id}`,
      shortId: short.id,
      assetType: 'image' as const,
      name: `${SYSTEM_SHORT_ASSET_PREFIX}${short.feature}｜${still.tag}`,
      fileUrl: still.file,
      imageCategory: 'system_screenshot',
      caption: `${short.title}短影片的系統畫面。${still.caption}${SYSTEM_SHORT_LIMIT}`,
      role: short.role,
      feature: short.feature,
      usageContext: still.label,
    })),
  ]);

  for (const row of rows) {
    const meta = JSON.stringify({ filmKey: row.key, source: 'system-short', shortId: row.shortId, brand: slug });
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
          metadata = ${meta}::jsonb
        WHERE id = ${targetId}::uuid
      `;
    };
    const find = async () => {
      const found = await sql`
        SELECT id FROM brand_assets
        WHERE brand_id = ${brandId}::uuid AND metadata->>'filmKey' = ${row.key}
        LIMIT 1
      `;
      return (found[0] as { id?: string } | undefined)?.id;
    };
    const id = await find();
    if (id) {
      await write(id);
      continue;
    }
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
      const again = await find();
      if (!again) throw e;
      await write(again);
    }
  }
  ensured.add(slug);
}
