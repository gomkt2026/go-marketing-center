-- ============================================================================
-- Migration 019: IG 操盤規則落地(搜尋打標籤、第一句 hook、4:5)
--   - TaskGo 補 Instagram channel
--   - 三品牌 IG 長度/格式/hashtag 上限對齊產圖規則
--   - 補顧客搜尋用 hashtag
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- ============================================================================

INSERT INTO brand_channels (
  brand_id, brand_version_id, platform, tone_of_voice, length_guideline, format_guideline,
  hashtag_count_min, hashtag_count_max
)
SELECT b.id, b.current_version_id, 'instagram',
       '視覺優先、工地語錄卡',
       '80-180字,前125字完整hook',
       '4:5 痛點主標+現場情境,第一張強hook',
       8, 12
FROM brands b
WHERE b.slug = 'taskgo'
  AND NOT EXISTS (
    SELECT 1 FROM brand_channels c
    WHERE c.brand_id = b.id AND c.platform = 'instagram'
  );

UPDATE brand_channels c
SET length_guideline = '80-180字,前125字完整hook',
    format_guideline = CASE b.slug
      WHEN 'taskgo' THEN '4:5 痛點主標+現場情境,第一張強hook'
      ELSE '4:5 痛點主標+搜尋打標籤,第一張強hook'
    END,
    hashtag_count_min = 8,
    hashtag_count_max = 12
FROM brands b
WHERE c.brand_id = b.id AND c.platform = 'instagram';

INSERT INTO brand_keywords (brand_id, brand_version_id, category, value)
SELECT b.id, b.current_version_id, 'hashtag', v.value
FROM brands b
JOIN (VALUES
  ('homigo', '#收租對帳'),
  ('homigo', '#代管系統'),
  ('taskgo', '#現場回報'),
  ('taskgo', '#工班管理'),
  ('washgo', '#洗衣店系統'),
  ('washgo', '#送洗履歷')
) AS v(slug, value) ON v.slug = b.slug
WHERE NOT EXISTS (
  SELECT 1 FROM brand_keywords k
  WHERE k.brand_id = b.id AND k.category = 'hashtag' AND k.value = v.value
);

INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order)
SELECT b.id, b.current_version_id, 'IG輪播尺寸', '1080x1350 (4:5)', 'layout', 1
FROM brands b
WHERE b.slug IN ('taskgo', 'washgo')
  AND NOT EXISTS (
    SELECT 1 FROM brand_visuals v
    WHERE v.brand_id = b.id AND v.label = 'IG輪播尺寸'
  );
