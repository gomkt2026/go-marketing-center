-- ============================================================================
-- Migration 062: FIXERCOWORK 2026-10 商業交流會議
-- ----------------------------------------------------------------------------
-- 海報場次：台北 10/7（已存在，更新議程與海報）、高雄 10/15、台中 10/16（新增）。
-- 可重複執行：新活動 slug 衝突略過，不重產 staff_token、不洗掉報名。
-- ============================================================================

UPDATE events
SET description = $desc$攜手合作 · 共創商機 · 共贏未來

會議議程
1. 商會介紹與開辦目的
2. 我們目前合作的產業
3. 打造共同產業鏈
4. 報價方式及分潤
5. 個別自我介紹
6. 各產業特惠及廣告行銷
7. 開發市場與未來市場展望
8. 協助產業全台布局$desc$
WHERE slug = '商業交流會議-台北10-7-ff2065';

-- 正式環境海報改由後台上傳到 R2。這裡只在還沒有媒體網址時補上靜態檔，避免重跑蓋掉已上傳的海報。
UPDATE events
SET edm_images = '[
  {"id":"meeting-2026-10","label":"10月商業交流會議","url":"/events/fixercowork-edm-2026-10.jpg"},
  {"id":"alliance-default","label":"21克拉工程聯盟","url":"/events/fixercowork-edm-alliance.png"}
]'::jsonb
WHERE slug = '商業交流會議-台北10-7-ff2065'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(edm_images) item
    WHERE item->>'url' LIKE '/api/media/%'
  );

INSERT INTO events (
  brand_id, slug, title, description, location, event_date, status,
  staff_token, form_fields, edm_images, line_add_friend_url, created_by
)
SELECT
  src.brand_id,
  v.slug,
  v.title,
  src.description,
  v.location,
  v.event_date,
  'open',
  encode(gen_random_bytes(24), 'hex'),
  src.form_fields,
  src.edm_images,
  src.line_add_friend_url,
  src.created_by
FROM events src
CROSS JOIN (
  VALUES
    (
      '商業交流會議-高雄-10-15'::citext,
      '商業交流會議｜高雄 10/15',
      '高雄市新興區民族二路82號',
      TIMESTAMPTZ '2026-10-15 13:30:00+08'
    ),
    (
      '商業交流會議-台中-10-16'::citext,
      '商業交流會議｜台中 10/16',
      '台中市南屯區五權西路二段666號15樓',
      TIMESTAMPTZ '2026-10-16 13:30:00+08'
    )
) AS v(slug, title, location, event_date)
WHERE src.slug = '商業交流會議-台北10-7-ff2065'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order)
SELECT e.id, '10/15（四）13:30 入場 · 16:00 結束', TIMESTAMPTZ '2026-10-15 13:30:00+08', NULL, 1
FROM events e
WHERE e.slug = '商業交流會議-高雄-10-15'
  AND NOT EXISTS (SELECT 1 FROM event_sessions s WHERE s.event_id = e.id);

INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order)
SELECT e.id, '10/16（五）13:30 入場 · 16:30 結束', TIMESTAMPTZ '2026-10-16 13:30:00+08', NULL, 1
FROM events e
WHERE e.slug = '商業交流會議-台中-10-16'
  AND NOT EXISTS (SELECT 1 FROM event_sessions s WHERE s.event_id = e.id);
