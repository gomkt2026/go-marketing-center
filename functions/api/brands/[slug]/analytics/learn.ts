import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { analyzeBrandPerformance } from '../../../../_shared/performance-learn';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const result = await analyzeBrandPerformance(context.env, brand.id);

  await logActivity(context.env, {
    brandId: brand.id, actorType: 'user', actorUserId: auth.id,
    action: 'analytics.learn_requested', entityType: 'brand', entityId: brand.id,
    afterState: result,
  });

  return json(result);
};
