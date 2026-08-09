-- ============================================================================
-- Migration 004: Threads 自動回覆熱門貼文(互動引流)
--   1. threads_reply_targets(搜尋到的目標貼文 + AI 生成回覆 + 發布狀態)
--   2. brand_social_accounts 新欄位(自動回覆開關 / 每日回覆上限)
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/004_threads_replies.sql
-- ============================================================================

-- ============================================================================
-- threads_reply_targets(每品牌透過 Keyword Search 找到的候選貼文)
--   status 流轉:
--     pending  → 待人工審核(auto_reply 關閉時)
--     approved → 已核准待發布(審核通過,由 API 立即發布)
--     replied  → 已發布回覆
--     skipped  → 人工略過或 AI 判定不適合
--     failed   → 發布失敗(記錄於 error_message)
-- ============================================================================
CREATE TABLE IF NOT EXISTS threads_reply_targets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  target_post_id     TEXT NOT NULL,                    -- Threads 貼文 id
  target_permalink   TEXT,                             -- 貼文連結
  target_username    TEXT,                             -- 作者帳號
  target_text        TEXT,                             -- 貼文內文快照
  target_timestamp   TIMESTAMPTZ,                      -- 貼文發布時間
  source_keyword     TEXT NOT NULL,                    -- 搜尋用的關鍵字
  like_count         INT,                              -- 互動數快照(搜尋當下)
  reply_count        INT,
  relevance_score    NUMERIC(3,2),                     -- AI 相關性評分 0-1
  relevance_reason   TEXT,                             -- AI 評估說明
  reply_text         TEXT,                             -- AI 生成的回覆文字
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | replied | skipped | failed
  reply_post_id      TEXT,                             -- 發布成功後的回覆貼文 id
  reply_permalink    TEXT,
  replied_at         TIMESTAMPTZ,
  error_message      TEXT,
  generated_by_agent_id UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  reviewed_by_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, target_post_id)                    -- 同品牌不重複處理同一貼文
);
CREATE INDEX IF NOT EXISTS idx_threads_reply_targets_brand_status
  ON threads_reply_targets(brand_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_reply_targets_replied
  ON threads_reply_targets(brand_id, replied_at DESC) WHERE status = 'replied';

DROP TRIGGER IF EXISTS trg_threads_reply_targets_updated_at ON threads_reply_targets;
CREATE TRIGGER trg_threads_reply_targets_updated_at BEFORE UPDATE ON threads_reply_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- brand_social_accounts 擴充:自動回覆設定(僅 threads 使用)
-- ============================================================================
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS auto_reply BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS reply_daily_cap INT NOT NULL DEFAULT 12;
