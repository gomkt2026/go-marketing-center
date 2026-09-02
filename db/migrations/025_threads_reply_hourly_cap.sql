-- ============================================================================
-- Migration 025: Threads 回覆小時上限
--   自動回覆與人工核准都受「過去 60 分鐘」閘門約束。
--   預設 5 則/小時,硬頂 20,避免被平台判定為 spam。
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/025_threads_reply_hourly_cap.sql
-- ============================================================================

ALTER TABLE brand_social_accounts
  ADD COLUMN IF NOT EXISTS reply_hourly_cap INT NOT NULL DEFAULT 5;

DO $$ BEGIN
  ALTER TABLE brand_social_accounts
    ADD CONSTRAINT brand_social_accounts_reply_hourly_cap_check
    CHECK (reply_hourly_cap >= 1 AND reply_hourly_cap <= 20);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE brand_social_accounts
SET reply_hourly_cap = 5
WHERE reply_hourly_cap IS NULL OR reply_hourly_cap < 1 OR reply_hourly_cap > 20;
