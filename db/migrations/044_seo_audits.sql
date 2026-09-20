-- ============================================================================
-- Migration 044: 官網 SEO 健檢報告
--   儲存 Homigo / TaskGo / Washgo 官網顧問模式稽核結果。可安全重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS seo_audits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  site_url          TEXT NOT NULL,
  health_score      INTEGER NOT NULL,
  summary           TEXT NOT NULL DEFAULT '',
  beginner_report   TEXT NOT NULL DEFAULT '',
  pages             JSONB NOT NULL DEFAULT '[]',
  findings          JSONB NOT NULL DEFAULT '[]',
  content_gaps      JSONB NOT NULL DEFAULT '[]',
  recommendations   JSONB NOT NULL DEFAULT '[]',
  score_breakdown   JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT seo_audits_score_check CHECK (health_score BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_seo_audits_brand
  ON seo_audits(brand_id, created_at DESC);
