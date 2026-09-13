-- ============================================================================
-- Migration 036: 三品牌愛情散文本週自動發、不經審閱
--   佔用該品牌當天 21:00 生活檔,避免排程再另生一篇撞車
--   Homigo 週一 / Washgo 週三 / TaskGo 週五(距 9/12 遠距離爆款隔開)
-- 可安全重複執行。
-- ============================================================================

UPDATE contents c
SET status = 'scheduled',
    generation_prompt_meta = COALESCE(c.generation_prompt_meta, '{}'::jsonb)
      || jsonb_build_object('slotAt', '2026-09-14T13:00:00.000Z'),
    updated_at = now()
FROM brands b
WHERE c.brand_id = b.id
  AND b.slug = 'homigo'
  AND c.title = '租屋裡的愛情修羅場'
  AND c.status IN ('pending_review', 'approved', 'draft');

UPDATE contents c
SET status = 'scheduled',
    generation_prompt_meta = COALESCE(c.generation_prompt_meta, '{}'::jsonb)
      || jsonb_build_object('slotAt', '2026-09-16T13:00:00.000Z'),
    updated_at = now()
FROM brands b
WHERE c.brand_id = b.id
  AND b.slug = 'washgo'
  AND c.title = '洗衣店巧遇的愛情'
  AND c.status IN ('pending_review', 'approved', 'draft');

UPDATE contents c
SET status = 'scheduled',
    generation_prompt_meta = COALESCE(c.generation_prompt_meta, '{}'::jsonb)
      || jsonb_build_object('slotAt', '2026-09-18T13:00:00.000Z'),
    updated_at = now()
FROM brands b
WHERE c.brand_id = b.id
  AND b.slug = 'taskgo'
  AND c.title = '工班愛情不被看扁'
  AND c.status IN ('pending_review', 'approved', 'draft');

INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
SELECT c.id, cv.id, 'threads', 'scheduled', '2026-09-14 21:00:00+08'::timestamptz
FROM contents c
JOIN brands b ON b.id = c.brand_id
JOIN content_versions cv ON cv.content_id = c.id AND cv.version_number = 1
WHERE b.slug = 'homigo' AND c.title = '租屋裡的愛情修羅場'
  AND NOT EXISTS (
    SELECT 1 FROM publishing_jobs j WHERE j.content_id = c.id AND j.platform = 'threads'
  );

INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
SELECT c.id, cv.id, 'threads', 'scheduled', '2026-09-16 21:00:00+08'::timestamptz
FROM contents c
JOIN brands b ON b.id = c.brand_id
JOIN content_versions cv ON cv.content_id = c.id AND cv.version_number = 1
WHERE b.slug = 'washgo' AND c.title = '洗衣店巧遇的愛情'
  AND NOT EXISTS (
    SELECT 1 FROM publishing_jobs j WHERE j.content_id = c.id AND j.platform = 'threads'
  );

INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
SELECT c.id, cv.id, 'threads', 'scheduled', '2026-09-18 21:00:00+08'::timestamptz
FROM contents c
JOIN brands b ON b.id = c.brand_id
JOIN content_versions cv ON cv.content_id = c.id AND cv.version_number = 1
WHERE b.slug = 'taskgo' AND c.title = '工班愛情不被看扁'
  AND NOT EXISTS (
    SELECT 1 FROM publishing_jobs j WHERE j.content_id = c.id AND j.platform = 'threads'
  );
