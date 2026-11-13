import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth, requireBrandAccess, forbidden } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { compileBrandIntelligence } from '../../../../_shared/brand-compile';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin' && auth.role !== 'brand_manager') return forbidden();

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const access = requireBrandAccess(auth, brand.id);
  if (access !== true) return access;

  try {
    const result = await compileBrandIntelligence(context.env, brand.id, auth.id);
    return json(result);
  } catch (e) {
    return error(e instanceof Error ? e.message : '整理品牌智慧失敗', 500);
  }
};
