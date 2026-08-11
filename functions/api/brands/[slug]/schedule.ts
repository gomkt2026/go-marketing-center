import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

const DEFAULT_RANGE_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_AFTER_MS = 4 * 24 * 60 * 60 * 1000;

// 行程表:讀取 publishing_jobs 依 scheduled_at/published_at 排序,帶回內容預覽與失敗原因
// 預設區間為「今天前 3 天 ~ 後 4 天」,前端可帶 ?from=&to=(ISO)自訂週期
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const url = new URL(context.request.url);
  const now = Date.now();
  const from = url.searchParams.get('from') ?? new Date(now - DEFAULT_RANGE_BEFORE_MS).toISOString();
  const to = url.searchParams.get('to') ?? new Date(now + DEFAULT_RANGE_AFTER_MS).toISOString();

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT pj.id, pj.content_id, pj.content_version_id, pj.platform, pj.status,
           pj.scheduled_at, pj.published_at, pj.external_post_id, pj.created_at,
           c.title, c.status AS content_status, c.generation_prompt_meta->>'source' AS gen_source,
           v.body, v.hashtags, a.file_url AS image_url,
           lg.detail AS last_log_detail
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    LEFT JOIN content_versions v ON v.id = pj.content_version_id
    LEFT JOIN LATERAL (
      SELECT file_url FROM content_assets
      WHERE content_version_id = v.id AND asset_type = 'image'
      LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT detail FROM publishing_logs
      WHERE publishing_job_id = pj.id
      ORDER BY created_at DESC LIMIT 1
    ) lg ON true
    WHERE c.brand_id = ${brand.id}::uuid
      AND coalesce(pj.scheduled_at, pj.published_at, pj.created_at) >= ${from}::timestamptz
      AND coalesce(pj.scheduled_at, pj.published_at, pj.created_at) < ${to}::timestamptz
    ORDER BY coalesce(pj.scheduled_at, pj.published_at, pj.created_at) ASC
  `;

  return json({ items: rowsToCamel(rows as Record<string, unknown>[]), from, to });
};

// 重新排入發布:把失敗的排程重設回 scheduled + 排定時間為現在,讓下一個 tick 的 publishDueJobs 重試
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as { jobId?: string };
  if (!body.jobId) return error('jobId is required', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT pj.id FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    WHERE pj.id = ${body.jobId}::uuid AND c.brand_id = ${brand.id}::uuid AND pj.status = 'failed'
    LIMIT 1
  `;
  if (!rows.length) return error('找不到可重新排入的失敗排程', 404);

  await sql`
    UPDATE publishing_jobs SET status = 'scheduled', scheduled_at = now(), updated_at = now()
    WHERE id = ${body.jobId}::uuid
  `;
  await sql`
    INSERT INTO publishing_logs (publishing_job_id, event, detail)
    VALUES (${body.jobId}::uuid, 'retried', '手動重新排入發布')
  `;

  return json({ ok: true });
};
