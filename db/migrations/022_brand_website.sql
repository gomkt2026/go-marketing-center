-- ============================================================================
-- Migration 022: 品牌官方網站
--   記錄各品牌官網,供客戶 LINE 資訊包引用。可安全重複執行。
-- ============================================================================

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS website_note TEXT;

UPDATE brands
SET website_url = COALESCE(website_url, 'https://app.taskgo.com.tw'),
    website_note = COALESCE(website_note, '產品入口與註冊頁,價格與方案以官網為準')
WHERE slug = 'taskgo';
