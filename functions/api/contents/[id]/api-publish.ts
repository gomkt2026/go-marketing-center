import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getThreadsAccount, publishThreadsPost } from '../../../_shared/threads';
import { logActivity } from '../../../_shared/activity';
import { json, error } from '../../../_shared/response';

// 已批准的內容透過官方 API 直接發布(目前支援 threads)
// 流程:批准 → 點「發布到 Threads」→ 呼叫 Threads API → 寫入發布紀錄
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const contentId = context.params.id as string;
  const sql = getSql(context.env);

  const contentRows = await sql`SELECT * FROM contents WHERE id = ${contentId}::uuid LIMIT 1`;
  if (!contentRows.length) return error('找不到內容', 404);
  const content = contentRows[0] as { brand_id: string; target_platform: string | null; status: string; title: string };

  if (content.target_platform !== 'threads') {
    return error('目前僅支援 Threads 透過 API 發布,FB / IG 請使用手動發布流程', 400);
  }
  if (!['approved', 'scheduled'].includes(content.status)) {
    return error('內容需先批准才能發布', 400);
  }

  const versionRows = await sql`
    SELECT id, body FROM content_versions
    WHERE content_id = ${contentId}::uuid ORDER BY version_number DESC LIMIT 1
  `;
  if (!versionRows.length) return error('內容沒有版本', 400);
  const version = versionRows[0] as { id: string; body: string };

  const account = await getThreadsAccount(context.env, content.brand_id);
  if (!account) return error('品牌尚未連接 Threads 帳號(社群帳號頁需填入有效 token)', 400);

  // 最新版本若有配圖則一併帶上(Threads 支援單張圖片)
  const assetRows = await sql`
    SELECT file_url FROM content_assets
    WHERE content_version_id = ${version.id}::uuid AND asset_type = 'image'
    LIMIT 1
  `;
  const imageUrl = assetRows.length ? (assetRows[0] as { file_url: string }).file_url : null;

  let published: { postId: string; permalink: string | null };
  try {
    published = await publishThreadsPost(account, { text: version.body, imageUrl });
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Threads 發布失敗', 502);
  }

  const jobRows = await sql`
    INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, published_at, published_by, external_post_id)
    VALUES (${contentId}::uuid, ${version.id}::uuid, 'threads', 'published',
            now(), ${auth.id}::uuid, ${published.permalink ?? published.postId})
    RETURNING id
  `;
  const jobId = (jobRows[0] as { id: string }).id;

  await sql`
    INSERT INTO publishing_logs (publishing_job_id, event, detail)
    VALUES (${jobId}::uuid, 'published', 'API 發布(內容中心批准後一鍵發布)')
  `;
  await sql`UPDATE contents SET status = 'published', updated_at = now() WHERE id = ${contentId}::uuid`;

  await logActivity(context.env, {
    brandId: content.brand_id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'publishing.published',
    entityType: 'publishing_job',
    entityId: jobId,
    afterState: { viaApi: true, platform: 'threads', permalink: published.permalink },
  });

  return json({ ok: true, jobId, permalink: published.permalink, postId: published.postId }, 201);
};
