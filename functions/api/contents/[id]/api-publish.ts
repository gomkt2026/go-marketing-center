import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getThreadsAccount, publishThreadsPost } from '../../../_shared/threads';
import { getMetaAccount, publishFacebookPost, publishInstagramPost, publishInstagramReel, composePostMessage } from '../../../_shared/meta';
import { toPublicMediaUrl } from '../../../_shared/media';
import { logActivity } from '../../../_shared/activity';
import { json, error } from '../../../_shared/response';

const PLATFORM_LABELS: Record<string, string> = { threads: 'Threads', facebook: 'Facebook', instagram: 'Instagram' };

// 已批准的內容透過官方 API 直接發布(支援 Threads / FB 粉專 / IG 商業帳號)
// 流程:批准 → 點「API 發布」→ 呼叫對應平台 API → 寫入發布紀錄
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const contentId = context.params.id as string;
  const sql = getSql(context.env);

  const contentRows = await sql`SELECT * FROM contents WHERE id = ${contentId}::uuid LIMIT 1`;
  if (!contentRows.length) return error('找不到內容', 404);
  const content = contentRows[0] as { brand_id: string; target_platform: string | null; status: string; title: string };

  const platform = content.target_platform;
  if (platform !== 'threads' && platform !== 'facebook' && platform !== 'instagram') {
    return error('此內容的目標平台不支援 API 發布', 400);
  }
  if (!['approved', 'scheduled'].includes(content.status)) {
    return error('內容需先批准才能發布', 400);
  }

  const versionRows = await sql`
    SELECT id, body, hashtags FROM content_versions
    WHERE content_id = ${contentId}::uuid ORDER BY version_number DESC LIMIT 1
  `;
  if (!versionRows.length) return error('內容沒有版本', 400);
  const version = versionRows[0] as { id: string; body: string; hashtags: string[] | null };

  // 最新版本配圖 / 短影音(轉成公開絕對網址,Meta 伺服器才抓得到)
  const assetRows = await sql`
    SELECT file_url, asset_type FROM content_assets
    WHERE content_version_id = ${version.id}::uuid AND asset_type IN ('image', 'video')
    ORDER BY created_at DESC
  `;
  const imageRow = (assetRows as { file_url: string; asset_type: string }[]).find((a) => a.asset_type === 'image');
  const videoRow = (assetRows as { file_url: string; asset_type: string }[]).find((a) => a.asset_type === 'video');
  const imageUrl = toPublicMediaUrl(context.env, imageRow?.file_url ?? null);
  const videoUrl = toPublicMediaUrl(context.env, videoRow?.file_url ?? null);

  let published: { postId: string; permalink: string | null };
  try {
    if (platform === 'threads') {
      const account = await getThreadsAccount(context.env, content.brand_id);
      if (!account) return error('品牌尚未連接 Threads 帳號(社群帳號頁需填入有效 token)', 400);
      published = await publishThreadsPost(account, { text: version.body, imageUrl, videoUrl });
    } else {
      const account = await getMetaAccount(context.env, content.brand_id, platform);
      if (!account) return error(`品牌尚未連接 ${PLATFORM_LABELS[platform]} 帳號(社群帳號頁需填入平台 ID 與有效 token)`, 400);
      const message = composePostMessage(version.body, version.hashtags);
      if (platform === 'instagram') {
        if (videoUrl) {
          published = await publishInstagramReel(account, { caption: message, videoUrl });
        } else if (imageUrl) {
          published = await publishInstagramPost(account, { caption: message, imageUrl });
        } else {
          return error('IG API 發布必須有配圖或短影音', 400);
        }
      } else {
        published = await publishFacebookPost(account, { message, imageUrl });
      }
    }
  } catch (e) {
    return error(e instanceof Error ? e.message : `${PLATFORM_LABELS[platform]} 發布失敗`, 502);
  }

  const jobRows = await sql`
    INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, published_at, published_by, external_post_id)
    VALUES (${contentId}::uuid, ${version.id}::uuid, ${platform}, 'published',
            now(), ${auth.id}::uuid, ${published.postId})
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
    afterState: { viaApi: true, platform, permalink: published.permalink },
  });

  return json({ ok: true, jobId, platform, permalink: published.permalink, postId: published.postId }, 201);
};
