import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { error } from '../../_shared/response';

function mediaHeaders(object: { httpMetadata?: { contentType?: string }; httpEtag: string; size: number }): Headers {
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  return headers;
}

async function loadMedia(env: Env, path: string | string[] | undefined) {
  if (!env.MEDIA) return { error: error('R2 bucket MEDIA 尚未綁定', 500) };
  const key = Array.isArray(path) ? path.join('/') : String(path ?? '');
  if (!key) return { error: error('缺少檔案路徑', 400) };
  const object = await env.MEDIA.get(key);
  if (!object) return { error: error('找不到檔案', 404) };
  return { object };
}

// 讀取 R2 中的媒體檔案。key 為隨機 UUID,無需登入即可讀取。
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const loaded = await loadMedia(context.env, context.params.path);
  if ('error' in loaded) return loaded.error;
  return new Response(loaded.object.body as unknown as BodyInit, { headers: mediaHeaders(loaded.object) });
};

/** LINE 語音／部分客戶端會先 HEAD。不要落到 SPA 回 HTML。 */
export const onRequestHead: PagesFunction<Env> = async (context) => {
  const loaded = await loadMedia(context.env, context.params.path);
  if ('error' in loaded) return loaded.error;
  return new Response(null, { headers: mediaHeaders(loaded.object) });
};
