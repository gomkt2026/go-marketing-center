-- ============================================================================
-- Migration 071: 每一班晨會的會議影片
--   film_status = script 表示腳本已進 R2，影片還沒掛上。
--   film_url 是做好的 mp4，給辦公室重看，也給三個品牌當發文素材。
-- ----------------------------------------------------------------------------
-- 可安全重複執行。
-- ============================================================================

ALTER TABLE office_standups ADD COLUMN IF NOT EXISTS film_url TEXT;
ALTER TABLE office_standups ADD COLUMN IF NOT EXISTS film_status TEXT;
