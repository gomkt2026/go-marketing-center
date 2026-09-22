import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, canAccessBrandSlug, forbidden } from '../../_shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const parts = new URL(context.request.url).pathname.split('/').filter(Boolean);
  // /api/brands 或 /api/brands/:slug/...
  const slug = parts[0] === 'api' && parts[1] === 'brands' ? parts[2] : undefined;
  // 用 session 裡的 brandSlugs 判斷，避免每個 API 再查一次 brands 表
  if (slug && !canAccessBrandSlug(auth, slug)) return forbidden();

  return context.next();
};
