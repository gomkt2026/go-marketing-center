import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel, rowToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const [rows, queueRows] = await Promise.all([
    // 發布紀錄:帶回發布版本的內文與配圖,前端點擊可直接展開檢視
    sql`
      SELECT pj.*, c.title AS content_title, c.target_platform,
             v.body, a.file_url AS image_url
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN content_versions v ON v.id = pj.content_version_id
      LEFT JOIN LATERAL (
        SELECT file_url FROM content_assets
        WHERE content_version_id = v.id AND asset_type = 'image'
        LIMIT 1
      ) a ON true
      WHERE c.brand_id = ${brand.id}::uuid
      ORDER BY pj.created_at DESC
      LIMIT 120
    `,
    // 各平台待發布佇列:尚未發布的內容(帶最新版本內文與配圖)
    sql`
      SELECT c.id, c.title, c.status, c.target_platform, c.predicted_engagement_score, c.created_at,
             c.generation_prompt_meta->>'source' AS gen_source,
             v.body, v.hashtags, a.file_url AS image_url
      FROM contents c
      LEFT JOIN LATERAL (
        SELECT id, body, hashtags FROM content_versions
        WHERE content_id = c.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      LEFT JOIN LATERAL (
        SELECT file_url FROM content_assets
        WHERE content_version_id = v.id AND asset_type = 'image'
        LIMIT 1
      ) a ON true
      WHERE c.brand_id = ${brand.id}::uuid
        AND c.target_platform IS NOT NULL
        AND c.status IN ('draft', 'pending_review', 'approved', 'needs_revision', 'scheduled')
      ORDER BY c.created_at DESC
      LIMIT 90
    `,
  ]);

  const jobs = (rows as Record<string, unknown>[]).map((r) => {
    const job = rowToCamel(r);
    return { ...job, contentTitle: r.content_title, targetPlatform: r.target_platform };
  });
  const queue = rowsToCamel(queueRows as Record<string, unknown>[]);

  return json({ jobs, queue });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    contentId?: string;
    contentVersionId?: string;
    platform?: string;
    scheduledAt?: string;
  };

  if (!body.contentId || !body.contentVersionId || !body.platform) {
    return error('contentId, contentVersionId, platform are required', 400);
  }

  const sql = getSql(context.env);
  const inserted = await sql`
    INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
    VALUES (
      ${body.contentId}::uuid,
      ${body.contentVersionId}::uuid,
      ${body.platform},
      ${body.scheduledAt ? 'scheduled' : 'queued'},
      ${body.scheduledAt ?? null}
    )
    RETURNING *
  `;

  const { logActivity } = await import('../../../_shared/activity');
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'publishing.published',
    entityType: 'publishing_job',
    entityId: (inserted[0] as { id: string }).id,
    afterState: inserted[0],
  });

  return json({ job: rowToCamel(inserted[0] as Record<string, unknown>) }, 201);
};
