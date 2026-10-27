-- ============================================================================
-- Migration 066: FIXERCOWORK 2026-11 商業交流會議
-- ----------------------------------------------------------------------------
-- 海報場次：台北 11/25；高雄 11/5、11/19；台中 11/6、11/20。
-- 高雄 11/5、台中 11/6 已由後台複製建立：換 11 月海報、修正場次時間。
-- 台北 11/25、高雄 11/19、台中 11/20 以高雄 11/5 為範本新增。
-- 可重複執行：新活動 slug 衝突略過，不重產 staff_token、不洗掉報名。
-- ============================================================================

UPDATE events
SET edm_images = '[
  {"id":"meeting-2026-11-v2","label":"11月商業交流會議","url":"/api/media/events/94d79992-184c-44bb-afd8-c0612bc236d1/edm/e59e9319-06ec-4306-ae6e-2326bd96ffb9.jpg"},
  {"id":"alliance-default","label":"21克拉工程聯盟","url":"/events/fixercowork-edm-alliance.png"}
]'::jsonb
WHERE slug IN (
  '商業交流會議-89e226', '商業交流會議-台中-11-5-a196da',
  '商業交流會議-台北-11-25', '商業交流會議-高雄-11-19', '商業交流會議-台中-11-20'
);

UPDATE event_sessions s
SET label = '11/5（四）13:30 入場 · 16:00 結束'
FROM events e
WHERE s.event_id = e.id AND e.slug = '商業交流會議-89e226';

UPDATE event_sessions s
SET label = '11/6（五）13:30 入場 · 16:30 結束',
    starts_at = TIMESTAMPTZ '2026-11-06 13:30:00+08'
FROM events e
WHERE s.event_id = e.id AND e.slug = '商業交流會議-台中-11-5-a196da';

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
      '商業交流會議-台北-11-25'::citext,
      '商業交流會議｜台北 11/25',
      '台北市民權西路20號9樓',
      TIMESTAMPTZ '2026-11-25 13:30:00+08'
    ),
    (
      '商業交流會議-高雄-11-19'::citext,
      '商業交流會議｜高雄 11/19',
      '高雄市新興區民族二路82號',
      TIMESTAMPTZ '2026-11-19 13:30:00+08'
    ),
    (
      '商業交流會議-台中-11-20'::citext,
      '商業交流會議｜台中 11/20',
      '台中市南屯區五權西路二段666號15樓',
      TIMESTAMPTZ '2026-11-20 13:30:00+08'
    )
) AS v(slug, title, location, event_date)
WHERE src.slug = '商業交流會議-89e226'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order)
SELECT e.id, v.label, v.starts_at, NULL, 1
FROM events e
JOIN (
  VALUES
    ('商業交流會議-台北-11-25'::citext, '11/25（三）13:30 入場 · 16:30 結束', TIMESTAMPTZ '2026-11-25 13:30:00+08'),
    ('商業交流會議-高雄-11-19'::citext, '11/19（四）13:30 入場 · 16:00 結束', TIMESTAMPTZ '2026-11-19 13:30:00+08'),
    ('商業交流會議-台中-11-20'::citext, '11/20（五）13:30 入場 · 16:30 結束', TIMESTAMPTZ '2026-11-20 13:30:00+08')
) AS v(slug, label, starts_at) ON v.slug = e.slug
WHERE NOT EXISTS (SELECT 1 FROM event_sessions s WHERE s.event_id = e.id);
