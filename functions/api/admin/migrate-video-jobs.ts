import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';

// POST /api/admin/migrate-video-jobs
// 生產環境套用 011_video_jobs(idempotent,僅 super_admin)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  const sql = getSql(context.env);
  const steps: string[] = [];

  try {
    await sql`DO $$ BEGIN
      CREATE TYPE video_source_type AS ENUM ('podcast_clip', 'upload');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    steps.push('type:video_source_type');

    await sql`DO $$ BEGIN
      CREATE TYPE video_job_status AS ENUM (
        'analyzing', 'strategy_review', 'rendering_preview',
        'preview_review', 'rendering_final', 'ready', 'rejected'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;
    steps.push('type:video_job_status');

    await sql`ALTER TYPE content_type ADD VALUE IF NOT EXISTS 'video'`;
    steps.push('enum:content_type.video');

    await sql`
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
      )
    `;
    steps.push('table:video_jobs');

    await sql`CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs(status, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_video_jobs_episode ON video_jobs(podcast_episode_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_video_jobs_brand ON video_jobs(brand_id, created_at DESC)`;
    await sql`DROP TRIGGER IF EXISTS trg_video_jobs_updated_at ON video_jobs`;
    await sql`CREATE TRIGGER trg_video_jobs_updated_at BEFORE UPDATE ON video_jobs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;
    steps.push('indexes+trigger');

    return json({ ok: true, steps });
  } catch (e) {
    return error(e instanceof Error ? `${e.message} (after: ${steps.join(', ')})` : 'Migration failed', 500);
  }
};
