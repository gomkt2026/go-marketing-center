import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { computeEngagementRate, upsertPerformanceReport } from '../../../../_shared/insights';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    jobId?: string;
    impressions?: number;
    clicks?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    likes?: number;
  };

  if (!body.jobId) return error('缺少 jobId', 400);

  const sql = getSql(context.env);
  const jobs = await sql`
    SELECT pj.id
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    WHERE pj.id = ${body.jobId}::uuid
      AND c.brand_id = ${brand.id}::uuid
      AND pj.status = 'published'
    LIMIT 1
  `;
  if (!jobs.length) return error('找不到已發布的貼文', 404);

  const metrics = {
    impressions: Math.max(0, Math.round(Number(body.impressions ?? 0))),
    clicks: Math.max(0, Math.round(Number(body.clicks ?? 0))),
    comments: Math.max(0, Math.round(Number(body.comments ?? 0))),
    shares: Math.max(0, Math.round(Number(body.shares ?? 0))),
    saves: Math.max(0, Math.round(Number(body.saves ?? 0))),
    likes: Math.max(0, Math.round(Number(body.likes ?? 0))),
  };
  const engagementRate = computeEngagementRate(metrics);

  await upsertPerformanceReport(context.env, body.jobId, {
    ...metrics,
    engagementRate,
    raw: { source: 'manual', likes: metrics.likes },
  });

  await logActivity(context.env, {
    brandId: brand.id, actorType: 'user', actorUserId: auth.id,
    action: 'analytics.report_manual', entityType: 'publishing_job', entityId: body.jobId,
    afterState: metrics,
  });

  return json({ ok: true });
};
