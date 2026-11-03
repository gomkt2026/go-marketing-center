-- ============================================================================
-- Migration 073: 和居家居發文節奏與素材
--   時段對齊 TaskGo、Washgo：FB/IG 每天 19:00，Threads 一天六則。
--   不加入自動發文。沒有接上的粉專不會被送出去。
--   會議短片與官方 IG 參考圖進素材庫。IG 圖已有字，狀態關閉，不拿去生圖。
-- ----------------------------------------------------------------------------
-- 可安全重複執行。
-- ============================================================================

UPDATE brand_posting_slots AS s
SET enabled = true, updated_at = now()
FROM brands b
WHERE s.brand_id = b.id
  AND b.slug = 'bbbox'
  AND (
    (s.platform IN ('facebook', 'instagram') AND s.hour_tw = 19 AND s.slot_kind = 'daily_theme')
    OR (s.platform = 'threads' AND s.hour_tw IN (0, 6, 12, 18) AND s.slot_kind = 'threads_hourly')
    OR (s.platform = 'threads' AND s.hour_tw IN (9, 21) AND s.slot_kind = 'threads_offtopic')
  );

DELETE FROM brand_posting_slots AS s
USING brands b
WHERE s.brand_id = b.id
  AND b.slug = 'bbbox'
  AND s.platform = 'threads'
  AND s.hour_tw IN (15, 20);

UPDATE brand_channels AS c
SET posting_frequency = CASE c.platform
  WHEN 'facebook' THEN '每天台灣 19:00 一則'
  WHEN 'instagram' THEN '每天台灣 19:00 一則，與 FB 同一主題'
  WHEN 'threads' THEN '每天 6 檔：00/06/12/18 流量文 + 09/21 生活文'
  ELSE c.posting_frequency
END
FROM brands b
WHERE c.brand_id = b.id
  AND b.slug = 'bbbox'
  AND c.platform IN ('facebook', 'instagram', 'threads');

UPDATE brand_image_prompts AS p
SET prompt = v.prompt, updated_at = now()
FROM brands b
JOIN (VALUES
  ('design_style', $p$BB BOX homepage photograph for 和居家居. One finished cabin already in use: rounded light shell, floor-to-ceiling glass, warm interior, wood deck or lawn, Taiwan mountain coast garden or quiet yard. Top third of a portrait or left third of a landscape is open sky. Yellow #F0D93D only as one small rounded tile. No letters, no logo, no flat color banner, no exploded wall panels, no navy diagonal, no cream rental flyer.$p$),
  ('photo_style', $p$Photograph, not an illustration. One finished BB BOX cabin, glass, warm light, wood deck or lawn, open sky for later type. No text, no price, no scaffolding.$p$),
  ('copy_spec', $p$"imagePrompt": "必填:這張圖要像 BB BOX 官網首頁的生活照片。一個已經能住的圓角艙，落地玻璃，室內暖光，木平台或草地。直式上方三分之一或橫式左側三分之一是開闊的天空。黃色只做一塊小圓角。禁止拆開的牆板、鷹架、安全帽、海軍藍斜切、米白租屋海報、任何文字與 logo。"$p$)
) AS v(slot, prompt) ON true
WHERE p.brand_id = b.id
  AND b.slug = 'bbbox'
  AND p.slot = v.slot;

INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order)
SELECT b.id, b.current_version_id, 'can_claim',
  'Instagram @hogea_bbbox 公開自介：和居家居 Hogea，MIT 在地組裝，輕住宅移動屋，空間大小可客製，並寫了免費環境場勘。網站 www.bbbox-shop.com，臉書寫 HOGEA 和居家居。',
  '2026-11-03 讀公開頁自介', 'verified', 30
FROM brands b
WHERE b.slug = 'bbbox'
  AND NOT EXISTS (
    SELECT 1 FROM brand_rules r
    WHERE r.brand_id = b.id AND r.statement LIKE 'Instagram @hogea_bbbox 公開自介%'
  );

INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order)
SELECT b.id, b.current_version_id, 'marketing_rule',
  '官方 IG 大頭貼是做好的艙：木平台、落地玻璃、躺椅。近況多是直式短片。粉絲數不可寫進文案當客戶數或業績。',
  '公開頁，文案多被登入牆截斷，不可把沒讀到的句子補完', 'verified', 31
FROM brands b
WHERE b.slug = 'bbbox'
  AND NOT EXISTS (
    SELECT 1 FROM brand_rules r
    WHERE r.brand_id = b.id AND r.statement LIKE '官方 IG 大頭貼是做好的艙%'
  );

INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order)
SELECT b.id, b.current_version_id, 'cannot_claim',
  '2026-10-30 的萬聖節海報是節慶圖，A 字玻璃屋，不可當成蘋果艙或第二空間的規格。',
  'https://www.instagram.com/hogea_bbbox/p/DfJQ2tRkyAj/', 'verified', 32
FROM brands b
WHERE b.slug = 'bbbox'
  AND NOT EXISTS (
    SELECT 1 FROM brand_rules r
    WHERE r.brand_id = b.id AND r.statement LIKE '2026-10-30 的萬聖節海報%'
  );

INSERT INTO brand_assets (
  brand_id, asset_type, name, file_url, caption, asset_role, feature, usage_context, asset_status, metadata
)
SELECT b.id, 'video'::asset_type, '晨會｜院子裡多一間', '/brands/bbbox/meeting-yard.mp4',
  '小盒和這一層小編對過的那一班。先問這塊地，看過再發。53 秒，不另外排程。',
  'brand', '晨會紀錄', '發文影片素材', 'active',
  '{"filmKey":"bbbox-meeting:yard","source":"bbbox-meeting"}'::jsonb
FROM brands b
WHERE b.slug = 'bbbox'
  AND NOT EXISTS (
    SELECT 1 FROM brand_assets a
    WHERE a.brand_id = b.id AND a.metadata->>'filmKey' = 'bbbox-meeting:yard'
  );

INSERT INTO brand_assets (
  brand_id, asset_type, name, file_url, image_category, caption, asset_role, feature, usage_context, asset_status, metadata
)
SELECT b.id, 'image'::asset_type, '官方IG｜2026-10-30 萬聖節', '/brands/bbbox/ig/2026-10-30-halloween.jpg',
  'other',
  '節慶海報，畫面已有「萬聖節快樂」。A 字玻璃屋，不是產品規格。',
  'brand', '官方IG', '只留參考，不拿去生圖', 'disabled',
  '{"source":"instagram","url":"https://www.instagram.com/hogea_bbbox/p/DfJQ2tRkyAj/"}'::jsonb
FROM brands b
WHERE b.slug = 'bbbox'
  AND NOT EXISTS (
    SELECT 1 FROM brand_assets a
    WHERE a.brand_id = b.id AND a.file_url = '/brands/bbbox/ig/2026-10-30-halloween.jpg'
  );

INSERT INTO brand_assets (
  brand_id, asset_type, name, file_url, image_category, caption, asset_role, feature, usage_context, asset_status, metadata
)
SELECT b.id, 'image'::asset_type, '官方IG｜2025-07-12 短片', '/brands/bbbox/ig/2025-07-12-reel.jpg',
  'people',
  '官方短片畫面。人站在玻璃前，字幕「什麼時代還在蓋房子」已燒進畫面。',
  'brand', '官方IG', '只留參考，不拿去生圖', 'disabled',
  '{"source":"instagram","url":"https://www.instagram.com/hogea_bbbox/reel/DMAiS6JhcNl/"}'::jsonb
FROM brands b
WHERE b.slug = 'bbbox'
  AND NOT EXISTS (
    SELECT 1 FROM brand_assets a
    WHERE a.brand_id = b.id AND a.file_url = '/brands/bbbox/ig/2025-07-12-reel.jpg'
  );
