import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { saveRenderResult } from '../../../_shared/video-jobs';
import { logActivity } from '../../../_shared/activity';

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

// POST /api/video-jobs/:id/render-result
// multipart: kind=preview|final, file=mp4
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return error('請用 multipart/form-data 上傳 mp4', 400);
  }

  const kindRaw = String(form.get('kind') ?? '');
  if (kindRaw !== 'preview' && kindRaw !== 'final') return error('kind 必須是 preview 或 final', 400);
  const file = form.get('file');
  if (!file || typeof file === 'string') return error('請上傳 file(mp4)', 400);
  const video = file as File;
  if (video.size === 0) return error('影片是空的', 400);
  if (video.size > MAX_VIDEO_BYTES) return error('影片過大,請壓在 80MB 以內', 400);

  try {
    const job = await saveRenderResult(context.env, {
      jobId: context.params.id as string,
      kind: kindRaw,
      bytes: new Uint8Array(await video.arrayBuffer()),
      contentType: video.type || 'video/mp4',
    });
    await logActivity(context.env, {
      brandId: job.brandId,
      actorType: 'user',
      actorUserId: auth.id,
      action: kindRaw === 'preview' ? 'video_job.preview_uploaded' : 'video_job.final_uploaded',
      entityType: 'video_job',
      entityId: job.id,
    });
    return json({ job });
  } catch (e) {
    return error(e instanceof Error ? e.message : '上傳渲染結果失敗', 400);
  }
};
