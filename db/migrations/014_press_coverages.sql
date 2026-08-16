-- ============================================================================
-- Migration 014: 媒體報導 press_coverages + 新聞稿 press_releases
--   第三方露出只存標題/出處/摘要/短金句/可宣稱事實,不存全文。
--   自家新聞稿可存全文,走內部草稿 → 審核 → 定稿。
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE press_coverage_status AS ENUM ('inbox', 'published', 'syndicated', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE press_discovery_source AS ENUM ('manual', 'scheduler');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE press_release_status AS ENUM ('draft', 'pending_review', 'approved', 'final');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE document_source_type ADD VALUE IF NOT EXISTS 'press_article';
ALTER TYPE document_source_type ADD VALUE IF NOT EXISTS 'press_release';

CREATE TABLE IF NOT EXISTS press_releases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  status            press_release_status NOT NULL DEFAULT 'draft',
  embargo_on        DATE,
  review_note       TEXT,
  created_by        UUID REFERENCES users(id),
  updated_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_press_releases_brand
  ON press_releases(brand_id, status, updated_at DESC);

DROP TRIGGER IF EXISTS trg_press_releases_updated_at ON press_releases;
CREATE TRIGGER trg_press_releases_updated_at BEFORE UPDATE ON press_releases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS press_coverages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  press_release_id      UUID REFERENCES press_releases(id) ON DELETE SET NULL,
  story_key             TEXT NOT NULL,
  outlet                TEXT NOT NULL,
  headline              TEXT NOT NULL,
  article_url           TEXT,
  published_on          DATE,
  status                press_coverage_status NOT NULL DEFAULT 'inbox',
  discovery_source      press_discovery_source NOT NULL DEFAULT 'manual',
  summary               TEXT,
  key_quotes            JSONB NOT NULL DEFAULT '[]',
  claimable_facts       JSONB NOT NULL DEFAULT '[]',
  is_primary            BOOLEAN NOT NULL DEFAULT true,
  related_brand_slugs   JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_press_coverages_brand
  ON press_coverages(brand_id, status, published_on DESC);
CREATE INDEX IF NOT EXISTS idx_press_coverages_story
  ON press_coverages(brand_id, story_key);
CREATE UNIQUE INDEX IF NOT EXISTS idx_press_coverages_url
  ON press_coverages(brand_id, article_url)
  WHERE article_url IS NOT NULL;

DROP TRIGGER IF EXISTS trg_press_coverages_updated_at ON press_coverages;
CREATE TRIGGER trg_press_coverages_updated_at BEFORE UPDATE ON press_coverages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brand_assets DROP CONSTRAINT IF EXISTS brand_assets_image_category_check;
ALTER TABLE brand_assets
  ADD CONSTRAINT brand_assets_image_category_check
  CHECK (image_category IS NULL OR image_category IN (
    'system_screenshot', 'real_photo', 'people', 'scene',
    'brand_collab', 'press_clipping', 'other'
  ));

-- ============================================================================
-- 種子:已見報主稿/轉載 + Washgo 新聞稿 + 可宣稱規則
-- ============================================================================

INSERT INTO press_coverages (
  brand_id, story_key, outlet, headline, article_url, published_on,
  status, discovery_source, summary, key_quotes, claimable_facts,
  is_primary, related_brand_slugs
)
SELECT b.id, v.story_key, v.outlet, v.headline, v.article_url, v.published_on::date,
       v.status::press_coverage_status, 'manual', v.summary,
       v.key_quotes::jsonb, v.claimable_facts::jsonb, v.is_primary, v.related_brand_slugs::jsonb
FROM brands b
JOIN (VALUES
  ('taskgo', 'taskgo-2025-10-launch', '工商時報',
   '數位工具平民化「匠管 Task Go」助攻工班資訊透明 打破紙本施工紀錄迷思',
   'https://www.ctee.com.tw/news/20251021701575-431206', '2025-10-21', 'published',
   '匠管推出 Task Go,主打簡單、即時、透明,讓工班用手機拍照與語音完成回報,並提供一個月免費試用。',
   '["Task Go 的初衷就是要讓沒有 IT 背景的師傅,也能用得安心、用得開心。","Task Go 將持續優化功能並結合 AI 技術,打造完整的數位工班生態系。"]',
   '["簡單、即時、透明","現場拍照上傳與語音紀錄","工時簽核與簽名驗收","一個月免費試用"]',
   true, '[]'),
  ('taskgo', 'taskgo-2025-10-launch', '三立新聞網',
   '打破紙本施工紀錄　數位工具助攻工班資訊',
   'https://www.setn.com/News.aspx?NewsID=1739028', '2025-10-21', 'syndicated',
   '三立轉載 Task Go 亮相稿,重點同樣是現場拍照、語音回報與工時簽核。',
   '[]', '[]', false, '[]'),
  ('taskgo', 'taskgo-2025-10-launch', '勢傳媒',
   '數位工具平民化「匠管 Task Go」助攻工班資訊透明 打破紙本施工紀錄迷思',
   'https://chinatrends.news/archives/69031', '2025-10-21', 'syndicated',
   '勢傳媒轉載同一則 Task Go 亮相稿。',
   '[]', '[]', false, '[]'),
  ('taskgo', 'taskgo-2026-07-alliance', '工商時報',
   '工程聯盟串聯跨域資源 「與大師有約」打造整合服務平台',
   'https://www.ctee.com.tw/news/20260711700444-431204', '2026-07-11', 'published',
   '工程聯盟活動報導點名 TaskGo 補上工程履歷與施工透明化,屬活動露出而非產品專題。',
   '[]',
   '["TaskGo 可協助工程履歷管理與施工流程數位化"]',
   true, '[]'),
  ('homigo', 'homigo-2026-07-launch', '民眾日報',
   '匠管攜手達觀跨足PropTech市場！ 推出Homigo智慧租屋管理平台',
   'https://tw.news.yahoo.com/%E5%8C%A0%E7%AE%A1%E6%94%9C%E6%89%8B%E9%81%94%E8%A7%80%E8%B7%A8%E8%B6%B3proptech%E5%B8%82%E5%A0%B4-%E6%8E%A8%E5%87%BAhomigo%E6%99%BA%E6%85%A7%E7%A7%9F%E5%B1%8B%E7%AE%A1%E7%90%86%E5%B9%B3%E5%8F%B0-080153567.html',
   '2026-07-01', 'published',
   '匠管攜手達觀推出 Homigo,以 LINE Bot 整合招租到退租流程,開發經驗源自 TaskGo。',
   '["未來企業競爭將不僅是系統功能,而是管理能力的數位化。","Homigo 除提供租屋管理工具外,也希望透過 AI 技術建構更智慧的管理模式。"]',
   '["匠管攜手達觀推出 Homigo","房東房客免下載 App,用 LINE 完成租金查詢與報修","開發經驗源自 TaskGo","根據市場統計,台灣租屋人口已超過 300 萬人"]',
   true, '["taskgo"]'),
  ('homigo', 'homigo-2026-07-launch', '臺灣郵報',
   '匠管攜手達觀跨足PropTech市場！ 推出Homigo智慧租屋管理平台',
   'https://taiwanpost.net/2026/local/149233/', '2026-07-01', 'syndicated',
   '臺灣郵報轉載 Homigo 發表稿。',
   '[]', '[]', false, '["taskgo"]'),
  ('homigo', 'homigo-2026-07-launch', '民眾新聞網',
   '匠管攜手達觀跨足PropTech市場！ 推出Homigo智慧租屋管理平台',
   'https://mypeoplevol.com/2026/local/100409', '2026-07-01', 'syndicated',
   '民眾新聞網轉載 Homigo 發表稿。',
   '[]', '[]', false, '["taskgo"]')
) AS v(slug, story_key, outlet, headline, article_url, published_on, status, summary, key_quotes, claimable_facts, is_primary, related_brand_slugs)
  ON b.slug = v.slug
WHERE NOT EXISTS (
  SELECT 1 FROM press_coverages pc
  WHERE pc.brand_id = b.id AND pc.article_url = v.article_url
);

INSERT INTO press_releases (brand_id, title, body, status, embargo_on)
SELECT b.id,
  '匠管打造生活工程管理生態系,Washgo 再補一塊拼圖',
  $washgo$匠管打造生活工程管理生態系，Washgo 再補一塊拼圖
Taskgo、Homigo、Washgo 三產品邁向整合；以 LINE 讓洗滌業真正用得起數位化，首個落地場域為洗楽

【台北訊】——深耕產業數位化的匠管今日宣布：正式推出面向洗衣、乾洗營運的數位化平台 Washgo。對匠管而言，這不只是再上線一套垂直系統，而是「生活工程管理」生態系又補上關鍵一塊：既有的 Taskgo 對應修繕與任務協作，Homigo 對應租賃與住宿場景，Washgo 則把洗滌營運接進來。

Washgo 以 LINE 為統一入口，結合 LIFF 應用與後台風控管理，讓客戶預約送洗、進度通知、簽收確認，以及員工收件、報價、品管、司機收送任務，都能在同一套日常工具裡完成。目標很直接——「會用 LINE，就能管好洗滌」。

Washgo 目前已於專業洗衣品牌洗楽完成場域導入。文中僅陳述導入事實，不放洗楽執行長引言，以免與洗楽自行發稿重疊。

匠管執行長陳炳寛表示：「我們著重的，不在於堆疊多難的 AI 技術或語言模型。匠管聚焦的是：如何協助那些在數位上相對弱勢的產業，找到真正可落地、可成長的動力。」
$washgo$,
  'pending_review',
  DATE '2026-08-16'
FROM brands b
WHERE b.slug = 'washgo'
  AND NOT EXISTS (
    SELECT 1 FROM press_releases pr
    WHERE pr.brand_id = b.id AND pr.title LIKE '匠管打造生活工程管理生態系%'
  );

INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order)
SELECT b.id, b.current_version_id, v.rule_type, v.statement, v.condition_note, v.verification, v.sort_order
FROM brands b
JOIN (VALUES
  ('taskgo', 'can_claim', '工商時報、三立曾報導 TaskGo 工班數位回報', '可引用媒體名與「簡單、即時、透明」等已見報事實,不可把轉載數說成全台專訪', 'verified', 20),
  ('taskgo', 'cannot_claim', '保證接案量、保證數位轉型成功、全台各大媒體專訪', '見報不代表保證成效', 'verified', 21),
  ('homigo', 'can_claim', '匠管攜手達觀推出 Homigo,見報於民眾日報／Yahoo', '可提 LINE Bot 免下載 App;提及 300 萬租屋人口必須帶「根據市場統計」', 'verified', 20),
  ('washgo', 'cannot_claim', '不可宣稱 Washgo 已被媒體報導', '新聞稿尚未見報前絕對禁止', 'verified', 20)
) AS v(slug, rule_type, statement, condition_note, verification, sort_order)
  ON b.slug = v.slug
WHERE NOT EXISTS (
  SELECT 1 FROM brand_rules r
  WHERE r.brand_id = b.id AND r.statement = v.statement
);

UPDATE collaboration_briefs
SET content_markdown = content_markdown || E'\n\n## 已公開媒體事實\n\n- Homigo 的開發經驗源自 TaskGo(2026-07-01 民眾日報／Yahoo 見報,可公開引用)\n- 不可把同一則轉載算成多次獨立專訪'
WHERE title = 'Homigo × TaskGo 修繕串接 Brief'
  AND content_markdown NOT LIKE '%已公開媒體事實%';
