-- ============================================================================
-- Migration 072: 和居家居（BB BOX）
--   獨立品牌。不加入三品牌自動發文，發文時段全部關閉。
--   體驗稿是草稿，不排程、不發送。
-- ----------------------------------------------------------------------------
-- 可安全重複執行。已存在的受眾、規則、草稿不會重覆插入。
-- 重跑會把這個品牌的發文時段維持關閉。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/072_bbbox_brand.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_image_prompts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  slot        TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_image_prompts_slot_check CHECK (slot IN ('design_style', 'photo_style', 'copy_spec')),
  UNIQUE (brand_id, slot)
);

DO $$
DECLARE
  b_id     UUID;
  v_id     UUID;
  admin_id UUID;
  camp_id  UUID;
  c_fb     UUID;
  c_ig     UUID;
  c_th     UUID;
  ver_fb   UUID;
  ver_ig   UUID;
BEGIN
  SELECT id INTO admin_id
  FROM users
  WHERE role = 'super_admin' AND is_active = true
  ORDER BY created_at ASC
  LIMIT 1;

  INSERT INTO brands (
    slug, name, tagline, primary_color, logo_url,
    website_url, website_note, blog_base_url, is_active
  )
  VALUES (
    'bbbox',
    '和居家居',
    '更多空間，更好生活',
    '#5B949A',
    '/brands/bbbox-logo.png',
    'https://bbbox-shop.com/zh/',
    '和居家居股份有限公司；BB BOX 伊格模組移動屋。展示中心：臺中市北屯區環中路一段1111號之1',
    'https://www.bbbox-shop.com/zh/info',
    true
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    tagline = EXCLUDED.tagline,
    primary_color = EXCLUDED.primary_color,
    logo_url = EXCLUDED.logo_url,
    website_url = EXCLUDED.website_url,
    website_note = EXCLUDED.website_note,
    blog_base_url = COALESCE(brands.blog_base_url, EXCLUDED.blog_base_url),
    is_active = true
  RETURNING id INTO b_id;

  INSERT INTO brand_versions (
    brand_id, version_number, status, summary_of_changes, compiled_markdown,
    confidence_score, published_by, published_at
  )
  SELECT
    b_id, 1, 'published',
    '首版：依 BB BOX 官網與小學堂索引建立，不接自動發文',
    $md$# 和居家居 品牌知識庫(Brand Knowledge Base)

> 版本發布時自動編譯,不可手動修改。如需修改請至品牌智慧頁編輯結構化條目。
> 人類可讀原稿: data/brands/BBBOX_BRAND_MARKETING.md

## 1. 品牌總覽
- 一句話定位: 更多空間，更好生活
- 官方網站: https://bbbox-shop.com/zh/
- 產品對外名稱: BB BOX 伊格模組移動屋
- 公司: 和居家居股份有限公司（HOGEA HOUSE COMPANY LIMITED），伊格控股集團

## 0. 使用規則
- 不可發明客戶數、市佔、營收、滿意度、回本年限
- 不可報價，不可保證合法、門牌、貸款或獲利
- 法規只寫依土地與縣市個案確認
- 蘋果艙鋼鋁、第二空間／歐寓全鋁、拓旅艙彩鋼板不可混寫
- 主 CTA 是預約賞屋，不用匠管聯絡方式

## 3. 目標受眾
- 有地想做旅宿或第二住宅的人
- 基地不好進車的業主
- 想加書房、會議或茶亭的人
- 營地與園區經營者

## 7. 產品事實（官網規格）
- 標準蘋果艙: 23.1 / 33.7 / 46.3 m²
- 模組蘋果艙: 3.6 / 5.4 / 7.7 / 11 坪，現場組裝
- 第二空間: 全鋁，基座版／地面版
- 歐寓: 約 5.5 / 6.5 / 7.5 坪加夾層
- 旅居 ADU: 9.2 / 11.6 / 14.2 坪
- 拓旅艙: 11 / 22 坪，工務與臨時空間，不是住宅替代
- 星穹艙（導覽亦稱星旅艙）: Core 約 5.4 坪、Extend 約 5.3 坪
$md$,
    0.86, admin_id, now()
  WHERE NOT EXISTS (
    SELECT 1 FROM brand_versions WHERE brand_id = b_id AND version_number = 1
  );

  SELECT id INTO v_id
  FROM brand_versions
  WHERE brand_id = b_id AND version_number = 1;

  UPDATE brands
  SET current_version_id = v_id
  WHERE id = b_id AND current_version_id IS NULL;

  UPDATE brand_versions
  SET compiled_markdown = $md$# 和居家居 品牌知識庫(Brand Knowledge Base)

> 版本發布時自動編譯,不可手動修改。如需修改請至品牌智慧頁編輯結構化條目。
> 人類可讀原稿: data/brands/BBBOX_BRAND_MARKETING.md

## 1. 品牌總覽
- 一句話定位: 更多空間，更好生活
- 官方網站: https://bbbox-shop.com/zh/
- 產品對外名稱: BB BOX 伊格模組移動屋
- 公司: 和居家居股份有限公司（HOGEA HOUSE COMPANY LIMITED），伊格控股集團

## 0. 使用規則
- 不可發明客戶數、市佔、營收、滿意度、回本年限
- 不可報價，不可保證合法、門牌、貸款或獲利
- 法規只寫依土地與縣市個案確認
- 蘋果艙鋼鋁、第二空間／歐寓全鋁、拓旅艙彩鋼板不可混寫
- 主 CTA 是預約賞屋，不用匠管聯絡方式

## 3. 目標受眾
- 有地想做旅宿或第二住宅的人
- 基地不好進車的業主
- 想加書房、會議或茶亭的人
- 營地與園區經營者

## 7. 產品事實（官網規格）
- 標準蘋果艙: 23.1 / 33.7 / 46.3 m²
- 模組蘋果艙: 3.6 / 5.4 / 7.7 / 11 坪，現場組裝
- 第二空間: 全鋁，基座版／地面版
- 歐寓: 約 5.5 / 6.5 / 7.5 坪加夾層
- 旅居 ADU: 9.2 / 11.6 / 14.2 坪
- 拓旅艙: 11 / 22 坪，工務與臨時空間，不是住宅替代
- 星穹艙（導覽亦稱星旅艙）: Core 約 5.4 坪、Extend 約 5.3 坪
$md$
  WHERE id = v_id
    AND (compiled_markdown IS NULL OR compiled_markdown NOT LIKE '%標準蘋果艙%');

  INSERT INTO brand_members (brand_id, user_id, role)
  SELECT b_id, u.id, 'super_admin'::user_role
  FROM users u
  WHERE u.role = 'super_admin' AND u.is_active = true
  ON CONFLICT (brand_id, user_id) DO NOTHING;

  INSERT INTO brand_assets (
    brand_id, asset_type, name, file_url, image_category, asset_role, asset_status, caption
  )
  SELECT
    b_id, 'logo', 'BB BOX logo', '/brands/bbbox-logo.png',
    'brand_identity', 'brand', 'active', '快裝模組移動屋'
  WHERE NOT EXISTS (
    SELECT 1 FROM brand_assets WHERE brand_id = b_id AND asset_type = 'logo'
  );

  IF NOT EXISTS (SELECT 1 FROM brand_audiences WHERE brand_id = b_id) THEN
    INSERT INTO brand_audiences (brand_id, brand_version_id, name, pain_points, appeal_angle, sort_order, lane)
    VALUES
      (b_id, v_id, '有地想做旅宿或第二住宅的人', '["地在，不知道先做旅宿、自住還是放著"]'::jsonb, '先問用途，再選蘋果艙、歐寓或旅居 ADU', 1, 'b2c'),
      (b_id, v_id, '基地不好進車的業主', '["路寬或轉彎不夠，整間成屋運不進去"]'::jsonb, '改現場組裝的模組蘋果艙，不是把房子做薄', 2, 'b2b'),
      (b_id, v_id, '想加一間書房、會議或茶亭的人', '["院子有地，卻不想先蓋一棟正式房子"]'::jsonb, '第二空間全鋁快裝，基座版或地面版看基地', 3, 'b2c'),
      (b_id, v_id, '營地與園區經營者', '["要分期加房間，也要工務或臨時大空間"]'::jsonb, '旅宿看蘋果艙與星穹艙，工務基地看拓旅艙', 4, 'b2b');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_personas WHERE brand_id = b_id) THEN
    INSERT INTO brand_personas (brand_id, brand_version_id, code, name, profile, pain_points, appeal_angle, lane, sort_order)
    VALUES
      (b_id, v_id, 'P1', '有地的屋主', '手上一塊地，想做第二住宅或小型旅宿', '["先被問一坪多少，土地條件還沒看"]'::jsonb, '先看怎麼住，再看 5.5 到 14 坪哪一種尺度', 'b2c', 1),
      (b_id, v_id, 'P2', '進場受限的業主', '道路、轉彎或吊裝讓整屋進不去', '["成屋運不進基地"]'::jsonb, '模組蘋果艙現場組裝，MINI 3.6 坪到大型 11 坪', 'b2b', 2),
      (b_id, v_id, 'P3', '庭院加建的人', '想要書房、茶亭或獨立工作間', '["不想為一間房先走完傳統建屋"]'::jsonb, '第二空間，全鋁，顏色與基座依基地選', 'b2c', 3),
      (b_id, v_id, 'P4', '園區與工務窗口', '營地要房間，案場要宿舍或臨時辦公室', '["住宅艙和工務艙被說成同一種"]'::jsonb, '星穹艙做景觀，拓旅艙做工寮與臨時基地', 'b2b', 4);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_rules WHERE brand_id = b_id) THEN
    INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order)
    VALUES
      (b_id, v_id, 'can_claim', '公司是和居家居股份有限公司（HOGEA HOUSE COMPANY LIMITED），屬伊格控股集團。產品對外名稱是 BB BOX 伊格模組移動屋。', '官網頁尾', 'verified', 1),
      (b_id, v_id, 'can_claim', '展示與聯絡：臺中市北屯區環中路一段1111號之1；電話 04-2355-0256；手機 0906-102-200；LINE @BBBOX；Instagram @hogea_bbbox。', '官網頁尾', 'verified', 2),
      (b_id, v_id, 'can_claim', '流程是場地評估、產品選擇、設計配置、工廠製作、運輸安裝、交付使用。', '官網服務流程', 'verified', 3),
      (b_id, v_id, 'can_claim', '標準蘋果艙：小 5.8×4×3 公尺、23.1 平方公尺；中 8.4×4×3 公尺、33.7 平方公尺；大 11.5×4×3 公尺、46.3 平方公尺。結構為鍍鋅鋼骨、鋁合金外殼、氟碳烤漆、膠合玻璃、岩棉。', '標準蘋果艙產品頁', 'verified', 4),
      (b_id, v_id, 'can_claim', '模組蘋果艙是現場組裝：MINI 4×3×3 公尺、3.6 坪；小型 6×3×3 公尺、5.4 坪；中型 8.5×3×3 公尺、7.7 坪；大型 12×3×3 公尺、11 坪。MINI 以外可整合衛浴。材料為鍍鋅鋼、鋁合金外殼、氟碳烤漆、5+5 膠合玻璃、50mm 岩棉。', '模組蘋果艙產品頁', 'verified', 5),
      (b_id, v_id, 'can_claim', '第二空間是全鋁快裝，有花園茶亭別墅、綠野仙蹤、海外 ADU。落地分基座版與地面版。基礎色是墨玉綠、太空灰、耀沙金、珍珠白。', '第二空間產品頁', 'verified', 6),
      (b_id, v_id, 'can_claim', '歐寓 100 約 5.5 坪、200 約 6.5 坪、300 約 7.5 坪加夾層。重點是挑高、可配置智慧控制、以入住完成度為標準，主結構為全鋁板式。', '歐寓產品頁', 'verified', 7),
      (b_id, v_id, 'can_claim', '旅居 ADU：L3489 為 8.94×3.48×3.3 公尺、9.2 坪；L34113 為 11.38×3.48×3.3 公尺、11.6 坪；L34138 為 13.82×3.48×3.3 公尺、14.2 坪。板式預製，可依型號整合客廳、廚房、臥室與獨立衛浴。', '旅居 ADU 產品頁', 'verified', 8),
      (b_id, v_id, 'can_claim', '拓旅艙 20 型 5.9×6.26×2.48 公尺、11 坪；40 型 11.8×6.16×2.48 公尺、22 坪。鍍鋅鋼骨架、50mm EPS 彩鋼板。用途是工寮、員工宿舍、辦公、臨時醫療與接待，不是住宅型產品的替代品。', '拓旅艙產品頁', 'verified', 9),
      (b_id, v_id, 'can_claim', '星穹艙（導覽亦稱星旅艙）Core 為直徑 4.0 公尺、高 2.8 公尺、約 5.4 坪；Extend 為主艙 4.0 公尺加延伸艙 2.5 公尺、約 5.3 坪。材質是高透明 PC 穹頂與航空鋁合金底座。', '星穹艙產品頁', 'verified', 10),
      (b_id, v_id, 'cannot_claim', '不可發明客戶數、市佔、營收、滿意度、回本年限，或沿用「90% 用戶」。', NULL, 'verified', 11),
      (b_id, v_id, 'cannot_claim', '不可報單價、總價、坪數單價，也不可寫搜尋摘要裡未對到產品頁正文的「7–12 週」或「100%」。', NULL, 'verified', 12),
      (b_id, v_id, 'cannot_claim', '不可寫某塊地合法、可設門牌、可貸款、不會被認定違建，或保證獲利。', '只能寫依用途與縣市確認', 'verified', 13),
      (b_id, v_id, 'cannot_claim', '不可把抗震 8 度、全鋁、鍍鋅鋼骨或 EPS 彩鋼板說成每一條產品線都有。社群不主動引用抗震等級。', '抗震 8 度只出現在第二空間頁', 'verified', 14),
      (b_id, v_id, 'cannot_claim', '不可把拓旅艙寫成住宅或民宿的替代品。', '產品頁已劃分用途', 'verified', 15),
      (b_id, v_id, 'negative_rule', '不可教人規避建照、違建、貸款審查，或用組合屋經營酒店、夜總會。', NULL, 'verified', 16),
      (b_id, v_id, 'negative_rule', '不可使用匠管、Homigo、TaskGo、Washgo 的聯絡方式，也不可寫成工地派工或租屋代管。', NULL, 'verified', 17),
      (b_id, v_id, 'negative_rule', '不可把小學堂標題裡的「完勝」「合法模組屋」「移動豪宅」「人到的地方都能蓋」當成已核對事實。', '標題只做索引', 'verified', 18),
      (b_id, v_id, 'marketing_rule', '社群主 CTA 是預約賞屋：04-2355-0256、0906-102-200、LINE @BBBOX。', '不用匠管信箱與電話', 'verified', 19),
      (b_id, v_id, 'marketing_rule', '法規句只能寫：依這塊地的用途與所在縣市確認，設置前先評估。', NULL, 'verified', 20),
      (b_id, v_id, 'marketing_rule', '比較貨櫃屋或太空艙時只講進場、外型與完成度，不寫完勝。', NULL, 'verified', 21);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_channels WHERE brand_id = b_id) THEN
    INSERT INTO brand_channels (
      brand_id, brand_version_id, platform, tone_of_voice, length_guideline, format_guideline,
      hashtag_count_min, hashtag_count_max, posting_frequency
    )
    VALUES
      (b_id, v_id, 'facebook', '像帶看的規劃人員，先問土地再講產品', '150-400字', '一個基地場面 → 一個產品怎麼選 → 預約賞屋', 2, 3, '手動，不自動排程'),
      (b_id, v_id, 'instagram', '短句，第一句就是進場或用途', '80-180字', '4:5，青綠底與黃標，底部只留痛點', 8, 12, '手動，不自動排程'),
      (b_id, v_id, 'threads', '一個場面，口語，不報價', '1-3 段', '先問這塊地，不教法規漏洞', 0, 4, '手動，不自動排程'),
      (b_id, v_id, 'website', '答案先行，規格只寫產品頁有的', '500-1800字', '不接官網 ingest，不發到 bbbox-shop.com', 0, 3, '只種題，不發布');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_keywords WHERE brand_id = b_id) THEN
    INSERT INTO brand_keywords (brand_id, brand_version_id, category, value)
    VALUES
      (b_id, v_id, 'hashtag', '#BBBOX'),
      (b_id, v_id, 'hashtag', '#和居家居'),
      (b_id, v_id, 'hashtag', '#模組屋'),
      (b_id, v_id, 'hashtag', '#移動屋'),
      (b_id, v_id, 'hashtag', '#蘋果艙'),
      (b_id, v_id, 'hashtag', '#組合屋'),
      (b_id, v_id, 'hashtag', '#土地活化'),
      (b_id, v_id, 'cta', '預約賞屋：04-2355-0256，或 LINE @BBBOX'),
      (b_id, v_id, 'website_cta', '預約賞屋／開始規劃'),
      (b_id, v_id, 'key_message', '更多空間，更好生活'),
      (b_id, v_id, 'key_message', '先問這塊地能做什麼，再選艙'),
      (b_id, v_id, 'key_message', '路進不去，就改現場組裝');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_visuals WHERE brand_id = b_id) THEN
    INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order)
    VALUES
      (b_id, v_id, '主色', '#5B949A', 'color', 1),
      (b_id, v_id, '黃標', '#F0D93D', 'color', 2),
      (b_id, v_id, '底色', '#E8F4F4', 'color', 3),
      (b_id, v_id, '深字', '#245E64', 'color', 4),
      (b_id, v_id, 'IG 尺寸', '1080x1350 (4:5)', 'layout', 5),
      (b_id, v_id, 'FB 尺寸', '1200x800', 'layout', 6),
      (b_id, v_id, '禁止', '海軍藍斜切工地語錄卡、米白租屋海報', 'layout', 7);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_examples WHERE brand_id = b_id) THEN
    INSERT INTO brand_examples (brand_id, brand_version_id, category, title, body, weight_percent)
    VALUES
      (b_id, v_id, 'content_pillar', '土地不知道怎麼用', '地放著時，先問用途與進場，不先報價。', 25),
      (b_id, v_id, 'content_pillar', '路進不去就現場組裝', '整屋運不進時，談模組蘋果艙，不把房子說成做薄。', 20),
      (b_id, v_id, 'content_pillar', '先選生活再選坪數', '歐寓、旅居 ADU、標準蘋果艙按人怎麼住來選。', 20),
      (b_id, v_id, 'content_pillar', '法規先問再蓋', '只寫依縣市與用途確認。不教規避。', 20),
      (b_id, v_id, 'content_pillar', '賞屋與展示中心', '台中北屯環中路一段1111號之1，可約看產品。', 15),
      (b_id, v_id, 'hot_topic_bank', '標準艙與模組艙', '差別是進場。標準艙是完成度較高的產品形式，模組艙現場組裝。', NULL),
      (b_id, v_id, 'hot_topic_bank', '貨櫃屋怎麼比', '只比外型、進場與完成度，不寫完勝。', NULL),
      (b_id, v_id, 'hot_topic_bank', '歐寓三種尺度', '100／200／300，先看幾個人住、要不要夾層。', NULL),
      (b_id, v_id, 'hot_topic_bank', '第二空間茶亭', '庭院加一間，先分基座版或地面版。', NULL),
      (b_id, v_id, 'hot_topic_bank', '拓旅艙是工務基地', '11 坪與 22 坪，給宿舍、辦公與臨時支援，不是住宅替代。', NULL),
      (b_id, v_id, 'hot_topic_bank', '星穹艙景觀包廂', '導覽稱星旅艙。透明穹頂，Core 與 Extend 兩種配置。', NULL),
      (b_id, v_id, 'storytelling', '轉彎不夠的那條路', '路寬寫得下，轉彎寫不下。同一套蘋果艙改成可拆開進場的模組，先看道路再選尺寸。', NULL);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_documents WHERE brand_id = b_id AND title = '和居家居品牌行銷資料') THEN
    INSERT INTO brand_documents (brand_id, brand_version_id, source_type, title, file_url, raw_content, extract_status)
    VALUES (
      b_id, v_id, 'brand_manual', '和居家居品牌行銷資料',
      'data/brands/BBBOX_BRAND_MARKETING.md',
      '官網產品規格與使用規則。全文見檔案，提示詞以結構化規則為準。',
      'ready'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_documents WHERE brand_id = b_id AND title = 'BB BOX 小學堂索引') THEN
    INSERT INTO brand_documents (brand_id, brand_version_id, source_type, title, file_url, raw_content, extract_status)
    VALUES (
      b_id, v_id, 'website', 'BB BOX 小學堂索引',
      'https://www.bbbox-shop.com/zh/info',
      '64 篇標題索引，不收全文。分類：法規、價格、土地、產品、案例。代表題：移動屋合法嗎、土地活化是什麼、標準蘋果艙與模組蘋果艙差在哪、貨櫃屋怎麼比。標題裡的價格、回本、90% 用戶、合法模組屋都不可當成可宣稱。完整標題見 data/brands/BBBOX_BRAND_MARKETING.md 附錄。',
      'ready'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM brand_seo_topics WHERE brand_id = b_id) THEN
    INSERT INTO brand_seo_topics (brand_id, topic, angle, primary_keyword, related_terms, category, search_intent, audience, sort_order)
    VALUES
      (b_id, '移動屋設置前要先確認什麼？', '從土地用途與縣市差異寫起，不判斷某一塊地合法，也不教規避。', '移動屋法規', '["組合屋","建照","農地","門牌"]'::jsonb, 'policy', 'informational', 'consumer', 1),
      (b_id, '閒置土地除了蓋房子，還能怎麼規劃？', '用活化的問題開口，再對到旅宿、庭院第二空間、工務基地，不保證收益。', '土地活化', '["小坪數","農地","建地","第二住宅"]'::jsonb, 'pain', 'informational', 'consumer', 2),
      (b_id, '標準蘋果艙和模組蘋果艙怎麼選？', '差別放在進場方式與尺寸，規格只寫產品頁有的數字。', '蘋果艙', '["模組屋","現場組裝","3.6坪","23.1平方公尺"]'::jsonb, 'product', 'solution', 'consumer', 3),
      (b_id, '貨櫃屋、太空艙、蘋果艙差在哪？', '只比較外型、進場與完成度，不寫完勝，不報價。', '貨櫃屋', '["太空艙","組合屋","移動屋"]'::jsonb, 'talk', 'informational', 'consumer', 4);
  END IF;

  INSERT INTO brand_image_prompts (brand_id, slot, prompt)
  VALUES
    (b_id, 'design_style', $p$BB BOX modular-cabin social poster. Mist field #E8F4F4, teal #5B949A, yellow #F0D93D only as a small module accent. Dark text #245E64. Subject is a modular cabin, site access, or a Taiwan land parcel. Top 25% of a portrait (or left 38% of a landscape) stays empty mist for later type. No letters, no logo, no navy diagonal construction poster, no cream rental flyer, no cute laundry illustration.$p$),
    (b_id, 'photo_style', $p$A single BB BOX site moment: a narrow access road, a modular cabin being set in place, or a yard about to gain one room. Mist #E8F4F4, teal #5B949A, one yellow accent. No text, no price, no hard-hat construction poster.$p$),
    (b_id, 'copy_spec', $p$"imagePrompt": "必填:這張圖是 BB BOX 模組屋社群海報（青綠 #5B949A、黃標 #F0D93D、霧底 #E8F4F4）。只描述畫面，不要描述任何要印在圖上的文字。上方 25% 留空。場景是進場、基地或艙體。禁止海軍藍斜切、米白租屋海報、報價、自己畫 logo。"$p$)
  ON CONFLICT (brand_id, slot) DO NOTHING;

  INSERT INTO ai_agents (brand_id, role_id, display_name, avatar_color, persona, is_active)
  SELECT b_id, r.id, '和居家居 小盒', '#5B949A',
    jsonb_build_object(
      'nickname', '小盒',
      'characterTitle', '帶看',
      'temperament', '先問土地與用途，再講產品。不報價，不保證合法。',
      'catchphrase', '先看這塊地',
      'focus', 'BB BOX 模組移動屋'
    ),
    true
  FROM agent_roles r
  WHERE r.code = 'brand_ai'
    AND NOT EXISTS (
      SELECT 1 FROM ai_agents a WHERE a.brand_id = b_id AND a.role_id = r.id
    );

  INSERT INTO brand_posting_slots (brand_id, platform, hour_tw, slot_kind, enabled)
  SELECT b_id, t.platform::publishing_platform, t.hour_tw, t.slot_kind, false
  FROM (VALUES
    ('facebook', 19, 'daily_theme'),
    ('instagram', 19, 'daily_theme'),
    ('threads', 0, 'threads_hourly'),
    ('threads', 6, 'threads_hourly'),
    ('threads', 12, 'threads_hourly'),
    ('threads', 15, 'threads_hourly'),
    ('threads', 18, 'threads_hourly'),
    ('threads', 20, 'threads_hourly'),
    ('threads', 9, 'threads_offtopic'),
    ('threads', 21, 'threads_offtopic')
  ) AS t(platform, hour_tw, slot_kind)
  ON CONFLICT (brand_id, platform, hour_tw, slot_kind) DO NOTHING;

  UPDATE brand_posting_slots
  SET enabled = false, updated_at = now()
  WHERE brand_id = b_id;

  IF NOT EXISTS (
    SELECT 1 FROM campaigns WHERE primary_brand_id = b_id AND title = '和居家居體驗稿'
  ) THEN
    INSERT INTO campaigns (primary_brand_id, title, objective, status)
    VALUES (b_id, '和居家居體驗稿', '品牌智慧定義後的三則社群草稿與兩張配圖。不排程、不發送。', 'planning')
    RETURNING id INTO camp_id;

    INSERT INTO campaign_brands (campaign_id, brand_id) VALUES (camp_id, b_id);

    INSERT INTO contents (campaign_id, brand_id, brand_version_id, content_type, target_platform, title, status, generation_prompt_meta)
    VALUES (
      camp_id, b_id, v_id, 'article', 'facebook', '路進不去，就改現場組裝', 'draft',
      '{"experience":true,"scheduled":false}'::jsonb
    )
    RETURNING id INTO c_fb;

    INSERT INTO contents (campaign_id, brand_id, brand_version_id, content_type, target_platform, title, status, generation_prompt_meta)
    VALUES (
      camp_id, b_id, v_id, 'article', 'instagram', '先問這塊地能做什麼', 'draft',
      '{"experience":true,"scheduled":false}'::jsonb
    )
    RETURNING id INTO c_ig;

    INSERT INTO contents (campaign_id, brand_id, brand_version_id, content_type, target_platform, title, status, generation_prompt_meta)
    VALUES (
      camp_id, b_id, v_id, 'article', 'threads', '進場之前，先不要談坪數', 'draft',
      '{"experience":true,"scheduled":false}'::jsonb
    )
    RETURNING id INTO c_th;

    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta)
    VALUES (
      c_fb, 1,
      $body$土地在，車卻進不去。彎道、吊車、路寬，常常比坪數先決定能不能放一間成屋。

BB BOX 的模組蘋果艙把空間拆成可運輸、可現場組裝的模組。MINI 3.6 坪到大型 11 坪，外型仍是蘋果艙，差別在進場方式。MINI 以外可以整合衛浴。材料是鍍鋅鋼骨與鋁合金外殼，不是把房子做薄。

這不是報價，也不是保證這塊地能設。先看道路、轉彎和用途，再決定是標準蘋果艙還是現場組裝。

台中北屯展示中心可以約。電話 04-2355-0256，或 LINE @BBBOX。$body$,
      '["BBBOX","模組屋","移動屋"]'::jsonb,
      '預約賞屋：04-2355-0256，或 LINE @BBBOX'
    )
    RETURNING id INTO ver_fb;

    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta)
    VALUES (
      c_ig, 1,
      $body$先問這塊地能做什麼，再談幾坪。

旅宿與第二住宅看標準蘋果艙、歐寓或旅居 ADU。庭院要多一間，看第二空間。工務和臨時大空間才看拓旅艙。尺寸都在產品頁上，這裡不報價。

預約賞屋：04-2355-0256／LINE @BBBOX$body$,
      '["BBBOX","蘋果艙","模組屋","移動屋","現場組裝","組合屋","土地規劃","和居家居"]'::jsonb,
      '預約賞屋：04-2355-0256，或 LINE @BBBOX'
    )
    RETURNING id INTO ver_ig;

    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta)
    VALUES (
      c_th, 1,
      $body$一塊地放著，第一句不該是蓋一棟。

先問進得了車嗎，用途是旅宿、書房還是工務基地。進不去，才看現場組裝；要大坪數的臨時空間，才看拓旅艙。法規仍要依這塊地跟縣市確認。$body$,
      '["BBBOX","移動屋"]'::jsonb,
      '預約賞屋：04-2355-0256，或 LINE @BBBOX'
    );

    INSERT INTO content_assets (content_version_id, asset_type, file_url, metadata)
    VALUES
      (ver_fb, 'image', '/brands/bbbox/draft-road.png', '{"headline":"路進不去就現場組","role":"experience-draft"}'::jsonb),
      (ver_ig, 'image', '/brands/bbbox/draft-land.png', '{"headline":"先問這塊地","role":"experience-draft"}'::jsonb);
  END IF;
END $$;
