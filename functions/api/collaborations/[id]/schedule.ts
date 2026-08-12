import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';

const DEFAULT_RANGE_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_AFTER_MS = 4 * 24 * 60 * 60 * 1000;

// Collaboration 範圍的行程表(目前只有 Go 生態系的共用 X 帳號會用到)。
// 跟品牌行程表(functions/api/brands/[slug]/schedule.ts)的差異:以 contents 為主表(LEFT JOIN
// publishing_jobs),因為 auto_publish 關閉時 pending_review 的內容不會建立 publishing_jobs,
// 但使用者仍需要在這裡看到「已生成、待審核」的貼文,才知道有沒有東西等著審——不能只看 jobs 表。
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const collaborationId = context.params.id as string;
  const sql = getSql(context.env);
  const collabRows = await sql`SELECT id, title FROM collaborations WHERE id = ${collaborationId}::uuid LIMIT 1`;
  if (!collabRows.length) return error('Collaboration not found', 404);

  const url = new URL(context.request.url);
  const now = Date.now();
  const from = url.searchParams.get('from') ?? new Date(now - DEFAULT_RANGE_BEFORE_MS).toISOString();
  const to = url.searchParams.get('to') ?? new Date(now + DEFAULT_RANGE_AFTER_MS).toISOString();

  const rows = await sql`
    SELECT c.id AS content_id, c.title, c.status AS content_status,
           c.generation_prompt_meta->>'source' AS gen_source,
           c.generation_prompt_meta->>'angleId' AS gen_category,
           c.created_at AS content_created_at,
           coalesce(pj.platform, c.target_platform) AS platform,
           pj.id AS job_id, pj.status AS job_status,
           pj.scheduled_at, pj.published_at, pj.external_post_id,
           v.body, v.hashtags, a.file_url AS image_url,
           lg.detail AS last_log_detail
    FROM contents c
    LEFT JOIN LATERAL (
      SELECT id, body, hashtags FROM content_versions
      WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1
    ) v ON true
    LEFT JOIN LATERAL (
      -- 排除 cancelled:取消過的 job 視同「還沒排入」,才能重新走一次核准流程
      SELECT id, platform, status, scheduled_at, published_at, external_post_id
      FROM publishing_jobs WHERE content_id = c.id AND status != 'cancelled' ORDER BY created_at DESC LIMIT 1
    ) pj ON true
    LEFT JOIN LATERAL (
      SELECT file_url FROM content_assets
      WHERE content_version_id = v.id AND asset_type = 'image' LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT detail FROM publishing_logs
      WHERE publishing_job_id = pj.id ORDER BY created_at DESC LIMIT 1
    ) lg ON true
    WHERE c.collaboration_id = ${collaborationId}::uuid
      AND coalesce(pj.scheduled_at, pj.published_at, c.created_at) >= ${from}::timestamptz
      AND coalesce(pj.scheduled_at, pj.published_at, c.created_at) < ${to}::timestamptz
    ORDER BY coalesce(pj.scheduled_at, pj.published_at, c.created_at) ASC
  `;

  return json({ items: rowsToCamel(rows as Record<string, unknown>[]), from, to });
};

interface ScheduleAction {
  action?: 'retry' | 'approve_publish';
  jobId?: string;
  contentId?: string;
}

// POST 兩種動作:
//   - retry:把失敗的 job 重設回 scheduled(同品牌行程表邏輯)
//   - approve_publish:待審核且尚未有 job 的內容,人工核准後立即建立 scheduled job(排入下一個 30 分鐘 tick 發布)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const collaborationId = context.params.id as string;
  const sql = getSql(context.env);
  const collabRows = await sql`SELECT id FROM collaborations WHERE id = ${collaborationId}::uuid LIMIT 1`;
  if (!collabRows.length) return error('Collaboration not found', 404);

  const body = await context.request.json().catch(() => ({})) as ScheduleAction;
  const action = body.action ?? 'retry';

  if (action === 'retry') {
    if (!body.jobId) return error('jobId is required', 400);
    const rows = await sql`
      SELECT pj.id FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE pj.id = ${body.jobId}::uuid AND c.collaboration_id = ${collaborationId}::uuid AND pj.status = 'failed'
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
  }

  if (action === 'approve_publish') {
    if (!body.contentId) return error('contentId is required', 400);
    const contentRows = await sql`
      SELECT c.id, c.target_platform, c.status,
             (SELECT id FROM content_versions WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1) AS version_id
      FROM contents c
      WHERE c.id = ${body.contentId}::uuid AND c.collaboration_id = ${collaborationId}::uuid
      LIMIT 1
    `;
    if (!contentRows.length) return error('找不到內容', 404);
    const content = contentRows[0] as { id: string; target_platform: string; status: string; version_id: string | null };
    if (!content.version_id) return error('這篇內容還沒有生成版本,無法發布', 400);

    const existingJob = await sql`
      SELECT id FROM publishing_jobs WHERE content_id = ${content.id}::uuid AND status IN ('scheduled', 'publishing', 'published') LIMIT 1
    `;
    if (existingJob.length) return error('這篇內容已經排入或發布過了', 409);

    const jobRows = await sql`
      INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
      VALUES (${content.id}::uuid, ${content.version_id}::uuid, ${content.target_platform}, 'scheduled', now())
      RETURNING id
    `;
    await sql`UPDATE contents SET status = 'scheduled', updated_at = now() WHERE id = ${content.id}::uuid`;
    await logActivity(context.env, {
      collaborationId,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'content.approved_for_publish',
      entityType: 'content',
      entityId: content.id,
      afterState: { jobId: (jobRows[0] as { id: string }).id },
    });
    return json({ ok: true, jobId: (jobRows[0] as { id: string }).id });
  }

  return error('未知的 action', 400);
};
