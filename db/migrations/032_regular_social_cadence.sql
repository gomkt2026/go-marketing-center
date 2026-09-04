-- ============================================================================
-- Migration 032: 規則發文節奏落地
--   - Washgo 補 Facebook channel(先前 seed 只有 IG + Threads)
--   - 三品牌寫入 posting_frequency,對齊 scheduler 實際節奏
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- ============================================================================

INSERT INTO brand_channels (
  brand_id, brand_version_id, platform, tone_of_voice, length_guideline, format_guideline,
  hashtag_count_min, hashtag_count_max, posting_frequency
)
SELECT b.id, b.current_version_id, 'facebook',
       '完整敘事、專業可信',
       '150-300字',
       '痛點場景 → 共鳴 → 系統解法 → CTA,搭配痛點海報',
       2, 3,
       '每天台灣 19:00 一則業者主題'
FROM brands b
WHERE b.slug = 'washgo'
  AND NOT EXISTS (
    SELECT 1 FROM brand_channels c
    WHERE c.brand_id = b.id AND c.platform = 'facebook'
  );

UPDATE brand_channels c
SET posting_frequency = CASE c.platform
  WHEN 'facebook' THEN '每天台灣 19:00 一則業者主題'
  WHEN 'instagram' THEN '每天台灣 19:00 一則,與 FB 同一主題'
  WHEN 'threads' THEN '每天 6 檔:00/06/12/18 熱議跟風 + 09/21 生活哏文'
  ELSE c.posting_frequency
END
FROM brands b
WHERE c.brand_id = b.id
  AND b.slug IN ('homigo', 'taskgo', 'washgo')
  AND c.platform IN ('facebook', 'instagram', 'threads');
