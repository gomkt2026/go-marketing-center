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
  '匠管打造生活工程管理生態系，Washgo 開放更多品牌加入',
  $washgo$匠管打造生活工程管理生態系，Washgo 開放更多品牌加入
Taskgo、Homigo、Washgo 三產品邁向整合；洗楽已完成導入，現以 LINE 讓更多洗滌業者真正用得起數位化

【台北訊】——深耕產業數位化的匠管今日宣布：面向洗衣、乾洗營運的數位化平台 Washgo，在首個落地場域洗楽完成導入後，正式以多品牌平台姿態，廣納更多洗滌品牌加入。對匠管而言，這不只是再上線一套垂直系統，而是「生活工程管理」生態系又補上關鍵一塊：既有的 Taskgo 對應修繕與任務協作，Homigo 對應租賃與住宿場景，Washgo 則把洗滌營運接進來。三個產品從此走上彼此整合的道路——讓居住、洗衣與未來的修繕，有機會走在同一條可管理、可追蹤、可協作的服務線上。

Washgo 同時要證明：洗滌產業不必再為數位化付出高額門檻。業者不必承擔多餘硬體導入或高額客製系統開發，即可透過台灣使用率最高的通訊平台 LINE，完成客戶服務、訂單、收送、洗滌紀錄與門市管理。匠管認為：AI 要走進百工百業，關鍵不在堆疊更難的模型，而在有沒有真實落地的場域。唯有系統進到日常營運、被第一線用起來，資訊化才進得了產業，也才談得上後續的智慧化。洗楽已把這條路跑通；下一步，是讓更多品牌用同一套工具走進來。

洗滌業缺的不是概念，而是進得去現場的工具

洗滌產業長期面臨人力分散、紙本紀錄難追溯、到府收送與門市資訊不同步等挑戰。傳統系統導入門檻高、建置週期長、客製費用昂貴，往往讓中小型業者望而卻步，數位化因此停在口號，難以變成每天都在跑的作業。

Washgo 以 LINE 為統一入口，結合 LIFF 應用與後台風控管理，讓客戶預約送洗、進度通知、簽收確認，以及員工收件、報價、品管、司機收送任務，都能在同一套日常工具裡完成。對業者，是把營運紀錄與管理一次打通；對一般民眾，則是沿用本來就在用的 LINE，不必再下載另一個 App、也不必重新學習一套陌生系統。目標很直接——「會用 LINE，就能管好洗滌」，讓送洗產業的數位落地，不再等於一筆高額專案。也正因門檻被拉低，Washgo 才能從單一場域，走向開放更多品牌共同使用的平台。

洗楽已落地：現場跑通之後，平台開始對外開放

Washgo 目前已於專業洗衣品牌洗楽完成場域導入。洗楽提供洗衣、洗鞋、寢具、包包及到府收送等專業洗護，門市作業與收送節奏本來就高度仰賴現場人力與即時溝通；導入 Washgo 後，內部流程與管理更聚焦，訂單、收送、品管與客戶通知得以收進同一條可追蹤的作業線，營運節奏也更清楚。

這次落地的意義，不只是單一品牌上線一套系統，而是把洗滌業最常見的現場條件——多品項、收送與門市並行、紀錄必須留得住——拿來驗證 Washgo 這塊拼圖是否真的嵌得進去。現場跑通之後，匠管要做的，是把同一套能力打開給更多洗衣、乾洗品牌與門市：不論是單店、連鎖或加盟，都能在不另建高額系統的前提下加入。洗楽後續也將自行對外說明導入經驗，並規劃未來兩年展店與加盟布局；匠管此番由產品與生態出發，洗楽則從品牌營運出發，兩篇敘事各自獨立，卻能對上同一組落地事實。

廣納更多品牌：一套平台，讓洗滌業一起數位化

Washgo 從設計之初即支援多品牌與多門市管理。洗楽作為首個落地場域，證明系統進得了現場；接下來的主軸，是讓更多洗滌品牌不必各自承擔硬體導入或客製開發，就能用同一套 LINE 入口與後台，完成客戶服務、訂單、收送、品管與門市管理。

對想加入的業者來說，重點不是再買一套進不去現場的系統，而是把既有作業收進每天都在用的工具裡。品牌可保有自己的門市節奏與服務品項，同時讓訂單、收送與客戶通知走在可追蹤的作業線上。匠管希望：洗滌業的數位化，不再是少數品牌的專案，而是更多業者都走得進來的共同基礎設施。

三塊拼圖開始靠攏：修繕、租賃、洗衣走向同一條生活服務線

Washgo 在洗滌現場站穩、並開始廣納品牌之後，匠管要做的下一步，是讓它不要成為又一個孤島。Taskgo 處理的是修繕如何被派遣、被執行、被留下紀錄；Homigo 處理的是人怎麼住、房子怎麼被管理；Washgo 處理的是衣服怎麼被收、被洗、被送回來。三件事看起來分屬不同產業，其實都發生在同一段生活裡。

兩邊、三邊接通後，房東、代管業者與房客，有機會在既有的租賃關係裡直接使用洗衣收送與進度追蹤，而不必再另外開一套互不相通的流程；未來再把修繕接進來，需求發生、服務派遣、過程留痕與完成確認，就能走在可協作的資料流上。重點不是一次宣布三套系統已經全部融合，而是 Washgo 補上後，Taskgo、Homigo、Washgo 第一次有了朝同一條路整合的完整拼圖；更多洗滌品牌加入，這條線才有機會真正長成生態。

匠管執行長陳炳寛表示：「我們著重的，不在於堆疊多難的 AI 技術或語言模型。匠管聚焦的是：如何協助那些在數位上相對弱勢的產業，找到真正可落地、可成長的動力。Taskgo、Homigo 已經分別在修繕與租賃場景證明：用 LINE，複雜的管理也可以變日常。Washgo 用同一條思路走進洗滌業，生活工程管理的生態系才算又補上一塊。也只有真實導入現場，AI 才進得了百工百業，而不是停在展示廳。」

他進一步指出：「洗楽已經把真實營運交給 Washgo 來跑，這比任何發表會都更重要。現場做實之後，下一步就是打開門，讓更多洗滌品牌一起進來。拼圖不是畫出來的，是一塊塊嵌進產業裡的；生態也不是一家品牌撐起來的，是更多業者願意用同一套工具一起走。」

先把落地做實，再讓更多品牌長進生態

展望未來，匠管將持續以洗楽等實地營運回饋優化 Washgo，並加速 Taskgo、Homigo、Washgo 的資訊串接，開放並協助更多洗滌品牌與門市以更輕量的方式完成數位升級——不必再為一套進不去現場的系統，付出高額設備與客製開發成本。對居住與生活服務來說，這也是把洗衣、並逐步把修繕，收進同一條可管理、可追蹤、可擴張的服務線。

匠管相信：產品必須先活在產業裡，AI 才有機會滲透進百工百業。Washgo 補上的，不只是洗滌這一個垂直領域，更是生活工程管理生態系得以走向整合、並廣納更多品牌加入的那一塊拼圖。

關於匠管
匠管專注於服務產業數位化，以產品力協助相對弱勢產業降低轉型門檻，並打造「生活工程管理」生態系。既有產品包括面向修繕與任務協作的 Taskgo、住宿／房客場景的 Homigo，以及洗滌產業 SaaS 平台 Washgo。匠管主張：只有真實落地導入，AI 才能走進百工百業；三個產品正朝資訊串接與服務整合前進，並開放更多洗滌品牌加入 Washgo。

關於洗楽
洗楽為專業洗衣品牌，提供洗衣、洗鞋、寢具、包包及到府收送等專業洗護，積極推動門市營運數位化。洗楽為 Washgo 首個落地導入場域，導入後內部流程與管理更聚焦，並規劃未來兩年展店與加盟布局，致力於提升台灣洗滌專業服務水準。

關於 Washgo
Washgo 為台灣洗滌／乾洗營運打造的多品牌 SaaS 平台，以 LINE 為主要服務介面，支援多品牌與門市管理、客戶送洗與進度通知、員工作業、品管與收送協作等，協助業者在不依賴高額設備與客製開發的前提下，完成洗滌紀錄與營運管理。洗楽已完成首個場域導入；平台現正開放更多洗衣、乾洗品牌加入。它同時是匠管生活工程管理生態系中，對應洗滌場域的一塊拼圖。

關於 Homigo
Homigo 為建立在 LINE 上的智慧租屋管理平台，協助房東、代管業者與房客處理招租、合約、收租、報修與通知等租屋日常。Washgo 落地後，匠管將把洗衣收送接進 Homigo 既有的租賃場景，並與 Taskgo 的修繕能力共同走向整合。

關於 Taskgo
Taskgo 為修繕媒合與任務協作平台，已與 Homigo 在報修、派工與進度同步上建立串接基礎。隨著 Washgo 加入並廣納更多洗滌品牌，匠管將逐步把修繕、租賃與洗衣收進同一套生活工程管理生態。
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
