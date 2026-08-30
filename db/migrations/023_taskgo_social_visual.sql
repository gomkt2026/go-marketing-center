-- ============================================================================
-- Migration 023: TaskGo FB/IG 圖文對齊匠管既有風格
--   主色海軍藍/青藍,橘黃只做強調;補構圖備註
-- ============================================================================
-- 可安全重複執行(idempotent)。
-- ============================================================================

INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order)
SELECT b.id, b.current_version_id, v.label, v.value, v.category, v.sort_order
FROM brands b
JOIN (VALUES
  ('主色-海軍藍', '#0B2D5C', 'color', 2),
  ('主色-青藍', '#2BA3D6', 'color', 3),
  ('強調-安全橘', '#ED9121', 'color', 4),
  ('強調-黃', '#F7B500', 'color', 5),
  ('圖文構圖', '斜切深藍banner+工地實拍+蜂巢紋+藍機器人吉祥物', 'layout', 6)
) AS v(label, value, category, sort_order) ON TRUE
WHERE b.slug = 'taskgo'
  AND NOT EXISTS (
    SELECT 1 FROM brand_visuals x
    WHERE x.brand_id = b.id AND x.label = v.label
  );

UPDATE brand_channels c
SET tone_of_voice = '視覺優先、匠管海軍藍設計圖',
    format_guideline = '4:5 斜切深藍+工地實拍,第一張強hook'
FROM brands b
WHERE c.brand_id = b.id AND b.slug = 'taskgo' AND c.platform = 'instagram';
