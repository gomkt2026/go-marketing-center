import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowToCamel, rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const [rows, suggestionRows] = await Promise.all([
    sql`
      SELECT
        pj.id AS job_id,
        pj.platform,
        pj.published_at,
        pj.external_post_id,
        c.id AS content_id,
        c.title AS content_title,
        c.predicted_engagement_score,
        c.generation_prompt_meta->>'source' AS gen_source,
        LEFT(COALESCE(cv.body, ''), 220) AS body_preview,
        cv.cta,
        pr.id AS perf_id,
        pr.impressions,
        pr.clicks,
        pr.comments,
        pr.shares,
        pr.saves,
        pr.engagement_rate,
        pr.captured_at,
        pr.raw_metrics
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN LATERAL (
        SELECT body, cta FROM content_versions
        WHERE content_id = c.id
        ORDER BY version_number DESC
        LIMIT 1
      ) cv ON true
      LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
      WHERE c.brand_id = ${brand.id}::uuid
        AND pj.status = 'published'
      ORDER BY pj.published_at DESC NULLS LAST
      LIMIT 100
    `,
    sql`
      SELECT * FROM learning_records
      WHERE brand_id = ${brand.id}::uuid AND status = 'pending_review'
      ORDER BY created_at DESC
      LIMIT 20
    `,
  ]);

  const posts = (rows as Record<string, unknown>[]).map((r) => {
    const raw = (r.raw_metrics ?? {}) as Record<string, unknown>;
    const hasPerf = Boolean(r.perf_id);
    return {
      job: {
        id: r.job_id,
        platform: r.platform,
        publishedAt: r.published_at,
        externalPostId: r.external_post_id,
      },
      content: {
        id: r.content_id,
        title: r.content_title,
        genSource: r.gen_source,
        predictedScore: r.predicted_engagement_score != null ? Number(r.predicted_engagement_score) : null,
        body: r.body_preview,
        cta: r.cta,
      },
      perf: hasPerf ? {
        id: r.perf_id,
        publishingJobId: r.job_id,
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        comments: Number(r.comments ?? 0),
        shares: Number(r.shares ?? 0),
        saves: Number(r.saves ?? 0),
        likes: Number(raw.likes ?? 0),
        engagementRate: Number(r.engagement_rate ?? 0),
        capturedAt: r.captured_at,
        rawMetrics: raw,
      } : null,
    };
  });

  const totals = posts.reduce(
    (acc, p) => {
      if (!p.perf) return acc;
      return {
        impressions: acc.impressions + p.perf.impressions,
        clicks: acc.clicks + p.perf.clicks,
        comments: acc.comments + p.perf.comments,
        shares: acc.shares + p.perf.shares,
        saves: acc.saves + p.perf.saves,
        likes: acc.likes + p.perf.likes,
      };
    },
    { impressions: 0, clicks: 0, comments: 0, shares: 0, saves: 0, likes: 0 },
  );

  return json({
    posts,
    suggestions: rowsToCamel(suggestionRows as Record<string, unknown>[]),
    totals,
    publishedCount: posts.length,
    syncedCount: posts.filter((p) => p.perf).length,
    reports: posts.filter((p) => p.perf).map((p) => ({
      perf: rowToCamel({
        id: p.perf!.id,
        publishing_job_id: p.job.id,
        impressions: p.perf!.impressions,
        clicks: p.perf!.clicks,
        comments: p.perf!.comments,
        shares: p.perf!.shares,
        saves: p.perf!.saves,
        engagement_rate: p.perf!.engagementRate,
        captured_at: p.perf!.capturedAt,
      }),
      content: { id: p.content.id, title: p.content.title },
    })),
  });
};
