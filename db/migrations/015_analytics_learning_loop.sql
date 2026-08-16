-- ============================================================================
-- Migration 015: 成效閉環
--   1. performance_reports 每個 publishing_job 只留最新一筆(UPSERT)
--   2. learning_records 加審核狀態:pending_review / approved / dismissed
--      既有會議與 seed 列預設 approved;AI 歸因建議先 pending,行銷人員核准後才進生成 context
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/015_analytics_learning_loop.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE learning_record_status AS ENUM ('pending_review', 'approved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE learning_records
  ADD COLUMN IF NOT EXISTS status learning_record_status NOT NULL DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS idx_learning_records_brand_status
  ON learning_records(brand_id, status, created_at DESC);

-- 同一 job 若已有多筆快照,只留 captured_at 最新(同時間則留 id 較新)
DELETE FROM performance_reports a
USING performance_reports b
WHERE a.publishing_job_id = b.publishing_job_id
  AND (a.captured_at < b.captured_at OR (a.captured_at = b.captured_at AND a.id < b.id));

CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_reports_job_unique
  ON performance_reports(publishing_job_id);
