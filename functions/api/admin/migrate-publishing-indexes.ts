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
  try {
    await sql`
      CREATE INDEX IF NOT EXISTS idx_publishing_jobs_scheduled_at
        ON publishing_jobs (scheduled_at)
        WHERE scheduled_at IS NOT NULL
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_publishing_jobs_published_at
        ON publishing_jobs (published_at)
        WHERE published_at IS NOT NULL
    `;
    return json({ ok: true, indexes: ['scheduled_at', 'published_at'] });
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Migration failed', 500);
  }
};
