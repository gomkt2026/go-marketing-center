-- ============================================================================
-- Migration 011: 短影音 video_jobs
--   Podcast 切杯與長影片精華共用同一張 job 表。
--   產物放 R2 videos/{jobId}/,不受 generated/ 31 天清理。
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE video_source_type AS ENUM ('podcast_clip', 'upload');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE video_job_status AS ENUM (
    'analyzing',
    'strategy_review',
    'rendering_preview',
    'preview_review',
    'rendering_final',
    'ready',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 既有 content_type 補 video(短影音成片);IF NOT EXISTS 需 PG 9.1+ / Neon 15+
ALTER TYPE content_type ADD VALUE IF NOT EXISTS 'video';

CREATE TABLE IF NOT EXISTS video_jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type          video_source_type NOT NULL,
  status               video_job_status NOT NULL DEFAULT 'analyzing',
  brand_id             UUID REFERENCES brands(id) ON DELETE SET NULL,
  podcast_episode_id   UUID REFERENCES podcast_episodes(id) ON DELETE SET NULL,
  content_id           UUID REFERENCES contents(id) ON DELETE SET NULL,
  title                TEXT,
  source_media_key     TEXT,
  source_media_url     TEXT,
  consent_scribe       BOOLEAN NOT NULL DEFAULT false,
  candidates           JSONB NOT NULL DEFAULT '[]',
  selected_candidate_id TEXT,
  strategy             JSONB,
  transcript           JSONB,
  edl                  JSONB,
  srt                  TEXT,
  edit_pack            JSONB,
  preview_url          TEXT,
  final_url            TEXT,
  error_message        TEXT,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_status
  ON video_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_episode
  ON video_jobs(podcast_episode_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_jobs_brand
  ON video_jobs(brand_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_video_jobs_updated_at ON video_jobs;
CREATE TRIGGER trg_video_jobs_updated_at BEFORE UPDATE ON video_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
