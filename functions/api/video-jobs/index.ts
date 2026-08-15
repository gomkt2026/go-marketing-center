import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, canAccessBrand, forbidden, isSuperAdmin } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { getBrandBySlug } from '../../_shared/queries';
import { listVideoJobs } from '../../_shared/video-jobs';

// GET /api/video-jobs?brand=homigo&episodeId=
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const episodeId = url.searchParams.get('episodeId') ?? undefined;
  const brandSlug = url.searchParams.get('brand') ?? undefined;
  let brandId: string | undefined;
  if (brandSlug) {
    const brand = await getBrandBySlug(context.env, brandSlug);
    if (!brand) return error('Brand not found', 404);
    if (!canAccessBrand(auth, brand.id)) return forbidden();
    brandId = brand.id;
  } else if (!isSuperAdmin(auth)) {
    brandId = auth.brandIds[0];
    if (!brandId) return json({ jobs: [] });
  }

  const jobs = await listVideoJobs(context.env, { brandId, episodeId });
  return json({ jobs });
};
