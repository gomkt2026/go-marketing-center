import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { loadWebsiteDestination, testWebsiteIngest } from '../../../_shared/website-articles';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const dest = await loadWebsiteDestination(context.env, brand.id);
  if (!dest) return error('找不到品牌目的地', 404);
  const result = await testWebsiteIngest(context.env, dest);
  return json(result, result.ok ? 200 : 400);
};
