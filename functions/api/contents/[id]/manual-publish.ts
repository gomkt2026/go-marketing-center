import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { logActivity } from '../../../_shared/activity';
import { json, error } from '../../../_shared/response';

// 手動發布流程:使用者已將文案/圖片貼到平台後,回來標記為已發布
// 建立一筆 published 狀態的 publishing_job 並將內容標記為 published
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const contentId = context.params.id as string;
  const body = await context.request.json().catch(() => ({})) as { externalPostUrl?: string };

  const sql = getSql(context.env);
  const contentRows = await sql`SELECT * FROM contents WHERE id = ${contentId}::uuid LIMIT 1`;
  if (!contentRows.length) return error('找不到內容', 404);
  const content = contentRows[0] as { brand_id: string; target_platform: string | null; status: string };
  if (!content.target_platform) return error('內容未指定目標平台', 400);
  if (!['approved', 'scheduled', 'published'].includes(content.status)) {
    return error('內容需先批准才能標記發布', 400);
  }

  const versionRows = await sql`
    SELECT id FROM content_versions WHERE content_id = ${contentId}::uuid ORDER BY version_number DESC LIMIT 1
  `;
  if (!versionRows.length) return error('內容沒有版本', 400);
  const versionId = (versionRows[0] as { id: string }).id;

  const jobRows = await sql`
    INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, published_at, published_by, external_post_id)
    VALUES (${contentId}::uuid, ${versionId}::uuid, ${content.target_platform}, 'published',
            now(), ${auth.id}::uuid, ${body.externalPostUrl ?? null})
    RETURNING *
  `;
  const jobId = (jobRows[0] as { id: string }).id;

  await sql`
    INSERT INTO publishing_logs (publishing_job_id, event, detail)
    VALUES (${jobId}::uuid, 'published', '手動發布(複製文案至平台後標記)')
  `;
  await sql`UPDATE contents SET status = 'published', updated_at = now() WHERE id = ${contentId}::uuid`;

  await logActivity(context.env, {
    brandId: content.brand_id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'publishing.published',
    entityType: 'publishing_job',
    entityId: jobId,
    afterState: { manual: true, platform: content.target_platform },
  });

  return json({ ok: true, jobId }, 201);
};
