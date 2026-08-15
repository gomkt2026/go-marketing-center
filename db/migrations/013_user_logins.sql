-- ============================================================================
-- Migration 013: 品牌登入帳號(username + password_hash)
-- ----------------------------------------------------------------------------
-- Admin 可在後台為品牌使用者設定登入帳號與密碼。super_admin 仍走環境變數。
-- 可安全重複執行。
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS username CITEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users (username)
  WHERE username IS NOT NULL;
