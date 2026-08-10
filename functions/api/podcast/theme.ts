import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';

// 片頭音樂固定存放在 R2 的這個 key(podcast/ 前綴不會被排程清除)
const THEME_KEY = 'podcast/assets/theme-intro.mp3';
const MAX_SIZE = 15 * 1024 * 1024; // 15MB

// GET /api/podcast/theme:查詢片頭音樂是否存在
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  const head = await context.env.MEDIA.head(THEME_KEY);
  return json({ url: head ? `/api/media/${THEME_KEY}` : null });
};

// POST /api/podcast/theme:上傳/覆蓋片頭音樂(body 為音檔原始 bytes)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  const contentType = context.request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('audio/')) {
    return error('請上傳音訊檔(mp3 / wav / m4a)', 400);
  }

  const bytes = await context.request.arrayBuffer();
  if (bytes.byteLength === 0) return error('檔案是空的', 400);
  if (bytes.byteLength > MAX_SIZE) return error('檔案過大,請壓在 15MB 以內', 400);

  await context.env.MEDIA.put(THEME_KEY, bytes, { httpMetadata: { contentType: 'audio/mpeg' } });
  return json({ url: `/api/media/${THEME_KEY}` });
};

// DELETE /api/podcast/theme:移除片頭音樂
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  await context.env.MEDIA.delete(THEME_KEY);
  return json({ ok: true });
};
