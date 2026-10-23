-- ============================================================================
-- Migration 067: 修繕聯盟報名表先隱藏安麗相關題目
-- ----------------------------------------------------------------------------
-- 公開報名表不再露出「是否聽過安麗課程或內容」與「安麗分會」。
-- 只改 form_fields 定義，不刪既有報名的 custom_answers。
-- 可重複執行。
-- ============================================================================

UPDATE events e
SET form_fields = COALESCE((
  SELECT jsonb_agg(field ORDER BY ord)
  FROM jsonb_array_elements(e.form_fields) WITH ORDINALITY AS t(field, ord)
  WHERE COALESCE(field->>'key', '') NOT ILIKE 'amway%'
    AND COALESCE(field->>'label', '') NOT LIKE '%安麗%'
), '[]'::jsonb)
FROM brands b
WHERE e.brand_id = b.id
  AND b.slug = 'fixercowork'
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(e.form_fields) field
    WHERE COALESCE(field->>'key', '') ILIKE 'amway%'
       OR COALESCE(field->>'label', '') LIKE '%安麗%'
  );
