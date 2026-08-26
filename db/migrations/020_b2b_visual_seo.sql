-- ============================================================================
-- Migration 020: B 端 IG/FB 視覺改走系統畫面/簡報風;SEO 長文不需先有媒體報導
--   - Washgo/Homigo/TaskGo IG format 對齊「真實後台 > AI 人物海報」
--   - 可安全重複執行
-- ============================================================================

UPDATE brand_channels c
SET format_guideline = CASE b.slug
  WHEN 'washgo' THEN '4:5 系統畫面或簡報風畫面卡,禁止 AI 店員海報與吉卜力'
  WHEN 'taskgo' THEN '4:5 派工/回報系統畫面或工地語錄卡,第一張強hook'
  ELSE '4:5 系統畫面或痛點主標+搜尋打標籤,第一張強hook'
END
FROM brands b
WHERE c.brand_id = b.id AND c.platform = 'instagram';
