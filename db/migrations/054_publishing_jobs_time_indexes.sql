-- 行程表 / 儀表板依 scheduled_at、published_at 篩選，避免掃整張 publishing_jobs
CREATE INDEX IF NOT EXISTS idx_publishing_jobs_scheduled_at
  ON publishing_jobs (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_publishing_jobs_published_at
  ON publishing_jobs (published_at)
  WHERE published_at IS NOT NULL;
