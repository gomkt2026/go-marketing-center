import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { createUploadJob, listVideoJobs } from '../../../../_shared/video-jobs';
import { logActivity } from '../../../../_shared/activity';

const MAX_UPLOAD_BYTES = 80 * 1024 * 1024;
const VIDEO_MIME = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm',
]);

// GET /api/brands/:slug/shorts
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const brand = await getBrandBySlug(context.env, context.params.slug as string);
  if (!brand) return error('Brand not found', 404);
  const jobs = await listVideoJobs(context.env, { brandId: brand.id });
  return json({ jobs });
};

// POST /api/brands/:slug/shorts
// multipart: file, consentScribe=true|false
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  const brand = await getBrandBySlug(context.env, context.params.slug as string);
  if (!brand) return error('Brand not found', 404);

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return error('請用 multipart/form-data 上傳影片', 400);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') return error('請上傳影片或音檔', 400);
  const media = file as File;
  if (media.size === 0) return error('檔案是空的', 400);
  if (media.size > MAX_UPLOAD_BYTES) return error('檔案過大,請壓在 80MB 以內(可先本機轉 720p)', 400);
  const mime = media.type || 'video/mp4';
  if (!VIDEO_MIME.has(mime) && !mime.startsWith('video/') && !mime.startsWith('audio/')) {
    return error('請上傳 mp4 / mov / webm 或音檔', 400);
  }

  const consentScribe = String(form.get('consentScribe') ?? '') === 'true';

  try {
    const job = await createUploadJob(context.env, {
      brandId: brand.id,
      createdBy: auth.id,
      fileBytes: new Uint8Array(await media.arrayBuffer()),
      fileName: media.name || 'source.mp4',
      mimeType: mime,
      consentScribe,
    });
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'video_job.created',
      entityType: 'video_job',
      entityId: job.id,
      afterState: { sourceType: 'upload', consentScribe, bytes: media.size },
    });
    return json({ job }, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : '上傳短影音素材失敗', 502);
  }
};
