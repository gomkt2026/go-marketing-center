-- ============================================================================
-- Migration 068: 服務展示書的按讚與留言
--   公開頁 /showcase/ 使用。聯絡方式只在管理 API 回傳。
--   API 也會在缺表時自行建立，這份 migration 讓正式庫有紀錄。
-- ----------------------------------------------------------------------------
-- 可重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS showcase_likes (
  product    text NOT NULL,
  vid        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product, vid)
);

CREATE TABLE IF NOT EXISTS showcase_comments (
  id         bigserial PRIMARY KEY,
  product    text NOT NULL,
  vid        text NOT NULL,
  name       text NOT NULL DEFAULT '',
  contact    text NOT NULL DEFAULT '',
  body       text NOT NULL,
  ip_hash    text NOT NULL DEFAULT '',
  hidden     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_showcase_comments_product
  ON showcase_comments (product, hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_showcase_comments_ip
  ON showcase_comments (ip_hash, created_at DESC);
