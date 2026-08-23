-- ============================================================================
-- Migration 016: 活動可各自上傳／替換 EDM
-- ============================================================================
-- 可安全重複執行。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/016_event_edm_images.sql
-- ============================================================================

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS edm_images JSONB NOT NULL DEFAULT '[]';

-- 9/3 高雄場：若尚未自訂 EDM，掛上新海報（之後可在後台上傳覆蓋）
UPDATE events
SET edm_images = '[
  {"id":"meeting-0903","label":"商業交流會議","url":"/events/fixercowork-edm-0903.jpg"}
]'::jsonb
WHERE COALESCE(jsonb_array_length(edm_images), 0) = 0
  AND (
    slug = '商業交流會議-高雄-09-03-ba1035'
    OR title ILIKE '%9/03%'
    OR title ILIKE '%09/03%'
  );
