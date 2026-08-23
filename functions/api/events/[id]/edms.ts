import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { getEventById, type EventEdmImage } from '../../../_shared/events';
import { buildEventEdmKey, mediaUrlToKey, putMedia } from '../../../_shared/media';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_EDMS = 8;
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};

async function saveEdmImages(env: Env, eventId: string, images: EventEdmImage[]) {
  const sql = getSql(env);
  await sql`UPDATE events SET edm_images = ${JSON.stringify(images)}::jsonb WHERE id = ${eventId}::uuid`;
}

async function deleteStoredEdm(env: Env, url: string) {
  const key = mediaUrlToKey(url);
  if (key && env.MEDIA) await env.MEDIA.delete(key).catch(() => undefined);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  const event = await getEventById(context.env, id);
  if (!event) return error('Event not found', 404);
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  let form: FormData;
  try {
    form = await context.request.formData() as unknown as FormData;
  } catch {
    return error('請用 multipart/form-data 上傳', 400);
  }

  const file = form.get('file');
  const label = String(form.get('label') ?? '').trim() || '活動 EDM';
  const replaceId = String(form.get('replaceId') ?? '').trim();

  if (!file || typeof file === 'string') return error('請上傳 EDM 圖片(jpg / png / webp)', 400);
  const imageFile = file as File;
  if (imageFile.size === 0) return error('圖片是空的', 400);
  if (imageFile.size > MAX_IMAGE_SIZE) return error('圖片過大,請壓在 10MB 以內', 400);

  const contentType = imageFile.type || 'image/jpeg';
  const ext = EXT_BY_MIME[contentType];
  if (!contentType.startsWith('image/') || !ext) return error('請上傳圖片檔(jpg / png / webp / gif)', 400);

  const key = buildEventEdmKey(id, ext);
  const fileUrl = await putMedia(context.env, key, new Uint8Array(await imageFile.arrayBuffer()), contentType);

  const current = event.edmImages;
  let next: EventEdmImage[];
  if (replaceId) {
    const target = current.find((item) => item.id === replaceId);
    if (!target) return error('要取代的 EDM 不存在', 404);
    await deleteStoredEdm(context.env, target.url);
    next = current.map((item) => (
      item.id === replaceId ? { ...item, label, url: fileUrl } : item
    ));
  } else {
    if (current.length >= MAX_EDMS) return error(`每個活動最多 ${MAX_EDMS} 張 EDM`, 400);
    next = [...current, { id: crypto.randomUUID(), label, url: fileUrl }];
  }

  await saveEdmImages(context.env, id, next);
  const updated = await getEventById(context.env, id);
  return json({ event: updated }, replaceId ? 200 : 201);
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  const event = await getEventById(context.env, id);
  if (!event) return error('Event not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    edmImages?: { id: string; label?: string; url?: string }[];
  };
  if (!Array.isArray(body.edmImages)) return error('edmImages is required', 400);

  const byId = new Map(event.edmImages.map((item) => [item.id, item]));
  const next: EventEdmImage[] = [];
  const kept = new Set<string>();
  for (const item of body.edmImages) {
    const existing = byId.get(item.id);
    if (!existing) continue;
    kept.add(existing.id);
    next.push({
      id: existing.id,
      url: existing.url,
      label: item.label?.trim() || existing.label,
    });
  }
  for (const old of event.edmImages) {
    if (!kept.has(old.id)) await deleteStoredEdm(context.env, old.url);
  }

  await saveEdmImages(context.env, id, next);
  return json({ event: await getEventById(context.env, id) });
};
