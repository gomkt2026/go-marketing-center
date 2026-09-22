-- 品牌智慧調整紀錄：每次草稿累積變更，發布時寫入摘要
ALTER TABLE brand_versions
  ADD COLUMN IF NOT EXISTS change_log JSONB NOT NULL DEFAULT '[]';
