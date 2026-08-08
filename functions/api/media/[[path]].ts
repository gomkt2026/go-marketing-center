import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { error } from '../../_shared/response';

// 讀取 R2 中的媒體檔案(生成圖片)。key 為隨機 UUID,無需登入即可讀取,
// 以便未來 Graph API 發布時能提供公開圖片 URL。
export const onRequestGet: PagesFunction<Env> = async (context) => {
  if (!context.env.MEDIA) return error('R2 bucket MEDIA 尚未綁定', 500);

  const segments = context.params.path;
  const key = Array.isArray(segments) ? segments.join('/') : String(segments ?? '');
  if (!key) return error('缺少檔案路徑', 400);

  const object = await context.env.MEDIA.get(key);
  if (!object) return error('找不到檔案', 404);

  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('ETag', object.httpEtag);
  return new Response(object.body as unknown as BodyInit, { headers });
};
