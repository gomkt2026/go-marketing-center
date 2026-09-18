-- ============================================================================
-- Migration 042: 官網 SEO 長文發布頻道
--   publishing_platform 加 website；品牌存 blog / ingest 目的地與加密金鑰。
--   產品站 website_url 不變（指揮中心 / app / pages.dev）。
--   可安全重複執行。
-- ============================================================================

ALTER TYPE publishing_platform ADD VALUE IF NOT EXISTS 'website';

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS blog_base_url TEXT,
  ADD COLUMN IF NOT EXISTS ingest_base_url TEXT,
  ADD COLUMN IF NOT EXISTS ingest_key_enc TEXT;

UPDATE brands SET
  blog_base_url = COALESCE(blog_base_url, 'https://www.homigo.com.tw'),
  ingest_base_url = COALESCE(ingest_base_url, 'https://housego-api.homigo.workers.dev')
WHERE slug = 'homigo';

UPDATE brands SET
  blog_base_url = COALESCE(blog_base_url, 'https://dev.taskgo.com.tw'),
  ingest_base_url = COALESCE(ingest_base_url, 'https://api.dev.taskgo.com.tw')
WHERE slug = 'taskgo';

UPDATE brands SET
  blog_base_url = COALESCE(blog_base_url, 'https://washgo.com.tw'),
  ingest_base_url = COALESCE(ingest_base_url, 'https://washgo-api.washgotaskgo.workers.dev')
WHERE slug = 'washgo';
