-- ============================================================================
-- Migration 024: FB/IG 系統畫面改做成 B 端痛點海報
--   不要整頁後台截圖置中鋪色塊;人物情境 + 主標 + 系統重點卡
-- ============================================================================
-- 可安全重複執行(idempotent)。
-- ============================================================================

UPDATE brand_channels c
SET format_guideline = CASE b.slug
  WHEN 'washgo' THEN '4:5 痛點海報+系統重點卡,不要整頁截圖直發'
  WHEN 'taskgo' THEN '4:5 斜切深藍痛點海報+派工畫面卡,第一張強hook'
  ELSE '4:5 痛點主標+情境+系統解法卡,第一張強hook'
END
FROM brands b
WHERE c.brand_id = b.id AND c.platform = 'instagram';

INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order)
SELECT b.id, b.current_version_id, 'FB/IG系統畫面', '痛點海報+系統重點卡,禁止整頁截圖直發', 'layout', 20
FROM brands b
WHERE b.slug IN ('homigo', 'taskgo', 'washgo')
  AND NOT EXISTS (
    SELECT 1 FROM brand_visuals x
    WHERE x.brand_id = b.id AND x.label = 'FB/IG系統畫面'
  );
