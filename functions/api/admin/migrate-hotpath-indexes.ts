import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  const sql = getSql(context.env);
  const applied: string[] = [];
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_publishing_jobs_scheduled_at
        ON publishing_jobs (scheduled_at) WHERE scheduled_at IS NOT NULL
    `;
    applied.push('idx_publishing_jobs_scheduled_at');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_publishing_jobs_published_at
        ON publishing_jobs (published_at) WHERE published_at IS NOT NULL
    `;
    applied.push('idx_publishing_jobs_published_at');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_contents_brand_updated
        ON contents (brand_id, updated_at DESC)
    `;
    applied.push('idx_contents_brand_updated');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_contents_brand_platform
        ON contents (brand_id, target_platform)
    `;
    applied.push('idx_contents_brand_platform');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_contents_slot_at
        ON contents ((generation_prompt_meta->>'slotAt'))
        WHERE generation_prompt_meta ? 'slotAt'
    `;
    applied.push('idx_contents_slot_at');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_content_assets_version_type
        ON content_assets (content_version_id, asset_type)
    `;
    applied.push('idx_content_assets_version_type');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_publishing_logs_job_created
        ON publishing_logs (publishing_job_id, created_at DESC)
    `;
    applied.push('idx_publishing_logs_job_created');
    await sql`
      CREATE INDEX IF NOT EXISTS idx_activity_logs_brand_action
        ON activity_logs (brand_id, action, created_at DESC)
    `;
    applied.push('idx_activity_logs_brand_action');
    return json({ ok: true, indexes: applied });
  } catch (e) {
    return error(e instanceof Error ? `${e.message} (applied: ${applied.join(', ')})` : 'Migration failed', 500);
  }
};
