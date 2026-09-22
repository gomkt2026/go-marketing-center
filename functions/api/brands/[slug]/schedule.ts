import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { logActivity } from '../../../_shared/activity';
import { rowsToCamel } from '../../../_shared/case';
import { json, error, failLoad } from '../../../_shared/response';

function parseHashtags(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    return raw.map((h) => String(h).replace(/^#/, '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(/[\s,]+/).map((h) => h.replace(/^#/, '').trim()).filter(Boolean);
  }
  return [];
}

const DEFAULT_RANGE_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_AFTER_MS = 4 * 24 * 60 * 60 * 1000;

// 行程表:讀取 publishing_jobs 依 scheduled_at/published_at 排序,帶回內容預覽與失敗原因
// 預設區間為「今天前 3 天 ~ 後 4 天」,前端可帶 ?from=&to=(ISO)自訂週期
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  try {
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
           c.generation_prompt_meta->>'category' AS gen_category,
           c.generation_prompt_meta->>'audienceLane' AS audience_lane,
           c.generation_prompt_meta->>'audienceName' AS audience_name,
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
    ) lg ON pj.status = 'failed'
    WHERE c.brand_id = ${brand.id}::uuid
      AND (
        (pj.scheduled_at >= ${from}::timestamptz AND pj.scheduled_at < ${to}::timestamptz)
        OR (pj.published_at >= ${from}::timestamptz AND pj.published_at < ${to}::timestamptz)
        OR (
          pj.scheduled_at IS NULL AND pj.published_at IS NULL
          AND pj.created_at >= ${from}::timestamptz AND pj.created_at < ${to}::timestamptz
        )
      )
    ORDER BY coalesce(pj.scheduled_at, pj.published_at, pj.created_at) ASC
  `;

  return json({ items: rowsToCamel(rows as Record<string, unknown>[]), from, to });
  } catch (e) {
    return failLoad('schedule', e);
  }
};

// 重新排入發布:把失敗的排程重設回 scheduled + 排定時間為現在,讓下一個 tick 的 publishDueJobs 重試
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    action?: string;
    jobId?: string;
    contentId?: string;
    scheduledAt?: string;
    title?: string;
    body?: string;
    hashtags?: string[] | string;
  };
  if (!body.jobId && !body.contentId) return error('jobId 或 contentId 必填', 400);

  const sql = getSql(context.env);

  if (body.action === 'update') {
    if (!body.jobId) return error('jobId is required', 400);
    const rows = await sql`
      SELECT pj.id, pj.status, pj.content_id, pj.content_version_id, c.title
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE pj.id = ${body.jobId}::uuid AND c.brand_id = ${brand.id}::uuid
        AND pj.status IN ('queued', 'scheduled', 'failed')
      LIMIT 1
    `;
    if (!rows.length) return error('找不到可編輯的排程', 404);
    const job = rows[0] as {
      id: string; status: string; content_id: string; content_version_id: string; title: string | null;
    };
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (!title) return error('標題不能空白', 400);
      await sql`
        UPDATE contents SET title = ${title}, updated_at = now()
        WHERE id = ${job.content_id}::uuid
      `;
    }
    const hashtags = parseHashtags(body.hashtags);
    if (typeof body.body === 'string' || hashtags) {
      if (!job.content_version_id) return error('這篇還沒有文案版本', 400);
      const nextBody = typeof body.body === 'string' ? body.body : null;
      if (nextBody !== null && !nextBody.trim()) return error('文案不能空白', 400);
      if (nextBody !== null && hashtags) {
        await sql`
          UPDATE content_versions
          SET body = ${nextBody}, hashtags = ${JSON.stringify(hashtags)}::jsonb
          WHERE id = ${job.content_version_id}::uuid
        `;
      } else if (nextBody !== null) {
        await sql`
          UPDATE content_versions SET body = ${nextBody}
          WHERE id = ${job.content_version_id}::uuid
        `;
      } else if (hashtags) {
        await sql`
          UPDATE content_versions SET hashtags = ${JSON.stringify(hashtags)}::jsonb
          WHERE id = ${job.content_version_id}::uuid
        `;
      }
    }
    await sql`
      INSERT INTO publishing_logs (publishing_job_id, event, detail)
      VALUES (${job.id}::uuid, 'retried', '行程表手動改文案')
    `;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'content.reviewed', entityType: 'content', entityId: job.content_id,
      afterState: { source: 'schedule', edited: true, jobId: job.id },
    });
    return json({ ok: true, status: 'updated' });
  }

  if (body.action === 'unschedule') {
    const rows = body.jobId
      ? await sql`
          SELECT pj.id, pj.content_id FROM publishing_jobs pj
          JOIN contents c ON c.id = pj.content_id
          WHERE pj.id = ${body.jobId}::uuid AND c.brand_id = ${brand.id}::uuid
            AND pj.status IN ('queued', 'scheduled', 'failed')
          LIMIT 1
        `
      : await sql`
          SELECT pj.id, pj.content_id FROM publishing_jobs pj
          JOIN contents c ON c.id = pj.content_id
          WHERE pj.content_id = ${body.contentId}::uuid AND c.brand_id = ${brand.id}::uuid
            AND pj.status IN ('queued', 'scheduled', 'failed')
          ORDER BY pj.scheduled_at DESC NULLS LAST
          LIMIT 1
        `;
    if (!rows.length) return error('找不到可取消的排程', 404);
    const job = rows[0] as { id: string; content_id: string };
    await sql`
      UPDATE publishing_jobs
      SET status = 'cancelled', updated_at = now()
      WHERE content_id = ${job.content_id}::uuid AND status IN ('queued', 'scheduled', 'failed')
    `;
    await sql`
      UPDATE contents SET status = 'pending_review', updated_at = now()
      WHERE id = ${job.content_id}::uuid
    `;
    await sql`
      INSERT INTO publishing_logs (publishing_job_id, event, detail)
      VALUES (${job.id}::uuid, 'cancelled', '行程表拉回工作台待審')
    `;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'content.reviewed', entityType: 'content', entityId: job.content_id,
      afterState: { source: 'schedule', unscheduled: true, jobId: job.id },
    });
    return json({ ok: true, status: 'pending_review' });
  }

  if (body.action === 'reschedule') {
    if (!body.jobId) return error('jobId is required', 400);
    const when = body.scheduledAt ? new Date(body.scheduledAt) : null;
    if (!when || Number.isNaN(when.getTime())) return error('scheduledAt 必須是有效時間', 400);
    const rows = await sql`
      SELECT pj.id, pj.status FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE pj.id = ${body.jobId}::uuid AND c.brand_id = ${brand.id}::uuid
        AND pj.status IN ('queued', 'scheduled', 'failed')
      LIMIT 1
    `;
    if (!rows.length) return error('找不到可改時間的排程', 404);
    await sql`
      UPDATE publishing_jobs
      SET status = 'scheduled', scheduled_at = ${when.toISOString()}::timestamptz, updated_at = now()
      WHERE id = ${body.jobId}::uuid
    `;
    await sql`
      INSERT INTO publishing_logs (publishing_job_id, event, detail)
      VALUES (${body.jobId}::uuid, 'retried', ${`改排到 ${when.toLocaleString('zh-TW')}`})
    `;
    return json({ ok: true, scheduledAt: when.toISOString() });
  }

  if (!body.jobId) return error('jobId is required', 400);

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
