import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_shared/env';
import { getSessionTokenFromRequest, parseSessionToken } from '../_shared/auth';

const ASSET = /\.(?:jpe?g|png|webp|mp4|webm)$/i;

/**
 * 簡報圖與影片放在網站上，給登入後的簡報模式使用。
 * 只驗登入憑證，不查資料庫，避免外地簡報時每一頁都等資料庫。
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { pathname } = new URL(context.request.url);
  if (!ASSET.test(pathname)) return context.next();

  const token = getSessionTokenFromRequest(context.request);
  const session = token ? await parseSessionToken(token, context.env) : null;
  if (!session) {
    return new Response('請先登入 GO 行銷中心', {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, max-age=86400');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
