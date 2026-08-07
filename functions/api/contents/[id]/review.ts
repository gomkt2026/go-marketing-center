import { Pool, neonConfig } from '@neondatabase/serverless';
import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { logActivity } from '../../../_shared/activity';
import { json, error } from '../../../_shared/response';

neonConfig.fetchConnectionCache = true;

const STATUS_MAP: Record<string, string> = {
  approve: 'approved',
  reject: 'rejected',
  modify: 'needs_revision',
  regenerate: 'needs_revision',
  return: 'needs_revision',
  postpone: 'draft',
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const contentId = context.params.id as string;
  const body = await context.request.json() as {
    action?: string;
    comment?: string;
    contentVersionId?: string;
  };

  if (!body.action) return error('action is required', 400);

  const pool = new Pool({ connectionString: context.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const contentRes = await client.query(
      'SELECT * FROM contents WHERE id = $1 FOR UPDATE',
      [contentId],
    );
    if (!contentRes.rows.length) {
      await client.query('ROLLBACK');
      return error('Content not found', 404);
    }
    const content = contentRes.rows[0];

    let versionId = body.contentVersionId ?? null;
    if (!versionId) {
      const vRes = await client.query(
        'SELECT id FROM content_versions WHERE content_id = $1 ORDER BY version_number DESC LIMIT 1',
        [contentId],
      );
      versionId = vRes.rows[0]?.id ?? null;
    }

    const reviewRes = await client.query(
      `INSERT INTO content_reviews (content_id, content_version_id, reviewer_id, action, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [contentId, versionId, auth.id, body.action, body.comment ?? ''],
    );

    const nextStatus = STATUS_MAP[body.action] ?? content.status;
    await client.query(
      'UPDATE contents SET status = $1, updated_at = now() WHERE id = $2',
      [nextStatus, contentId],
    );

    await client.query('COMMIT');

    const activityAction = body.action === 'approve' ? 'content.approved'
      : body.action === 'reject' ? 'content.rejected' : 'content.reviewed';

    await logActivity(context.env, {
      brandId: content.brand_id,
      actorType: 'user',
      actorUserId: auth.id,
      action: activityAction,
      entityType: 'content',
      entityId: contentId,
      afterState: { status: nextStatus, reviewId: reviewRes.rows[0].id },
    });

    return json({ ok: true, status: nextStatus, review: reviewRes.rows[0] });
  } catch (e) {
    await client.query('ROLLBACK');
    return error(e instanceof Error ? e.message : 'Review failed', 500);
  } finally {
    client.release();
    await pool.end();
  }
};
