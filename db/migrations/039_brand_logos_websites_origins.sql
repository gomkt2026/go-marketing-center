-- ============================================================================
-- Migration 039: 補回三品牌官方 logo、產品官網、客服 widget 白名單
--   2026-09-15 正式庫被 seed.sql TRUNCATE 後,logo_url / website / 社群帳號 / 行程表
--   一併被清掉。Logo 檔在 public/brands 與 R2 brand-assets/{slug}/logo.png。
--   社群 token 無法從 seed 還原,需 Neon PITR 或重新貼上。
--   可安全重複執行。
-- ============================================================================

UPDATE brands SET
  logo_url = '/api/media/brand-assets/homigo/logo.png',
  website_url = COALESCE(website_url, 'https://cc.homigo.workers.dev'),
  website_note = COALESCE(website_note, 'Homigo 指揮中心；房客／房東主要走 LINE LIFF')
WHERE slug = 'homigo';

UPDATE brands SET
  logo_url = '/api/media/brand-assets/taskgo/logo.png',
  website_url = COALESCE(website_url, 'https://app.taskgo.com.tw'),
  website_note = COALESCE(website_note, '產品入口與註冊頁,價格與方案以官網為準')
WHERE slug = 'taskgo';

UPDATE brands SET
  logo_url = '/api/media/brand-assets/washgo/logo.png',
  website_url = COALESCE(website_url, 'https://washgo.pages.dev'),
  website_note = COALESCE(website_note, 'Washgo 產品網站；門市與司機作業走 LINE LIFF（washgo-liff.pages.dev）')
WHERE slug = 'washgo';

UPDATE brands SET logo_url = COALESCE(logo_url, '/brands/fixercowork-logo.png')
WHERE slug = 'fixercowork';

INSERT INTO product_help_origins (brand_id, origin)
SELECT b.id, o.origin
FROM brands b
CROSS JOIN (VALUES
  ('https://app.taskgo.com.tw'),
  ('https://dev.taskgo.com.tw'),
  ('http://localhost:5173'),
  ('https://liff.line.me')
) AS o(origin)
WHERE b.slug = 'taskgo'
ON CONFLICT (brand_id, origin) DO NOTHING;

INSERT INTO product_help_origins (brand_id, origin)
SELECT b.id, o.origin
FROM brands b
CROSS JOIN (VALUES
  ('https://cc.homigo.workers.dev'),
  ('https://liff.line.me'),
  ('http://localhost:5173')
) AS o(origin)
WHERE b.slug = 'homigo'
ON CONFLICT (brand_id, origin) DO NOTHING;

INSERT INTO product_help_origins (brand_id, origin)
SELECT b.id, o.origin
FROM brands b
CROSS JOIN (VALUES
  ('https://washgo.pages.dev'),
  ('https://washgo-liff.pages.dev'),
  ('https://liff.line.me'),
  ('http://localhost:3000'),
  ('http://localhost:3001')
) AS o(origin)
WHERE b.slug = 'washgo'
ON CONFLICT (brand_id, origin) DO NOTHING;
