import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, canAccessBrand, forbidden } from '../../_shared/auth';
import { getBrandBySlug } from '../../_shared/queries';

export const onRequest: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const parts = new URL(context.request.url).pathname.split('/').filter(Boolean);
  // /api/brands 或 /api/brands/:slug/...
  const slug = parts[0] === 'api' && parts[1] === 'brands' ? parts[2] : undefined;
  if (slug) {
    const brand = await getBrandBySlug(context.env, slug);
    if (brand && !canAccessBrand(auth, brand.id)) return forbidden();
  }

  return context.next();
};
