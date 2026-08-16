import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { syncJobs } from '../../../../_shared/insights';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as { jobId?: string };
  try {
    const result = await syncJobs(context.env, { brandId: brand.id, jobId: body.jobId });
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'analytics.synced', entityType: 'brand', entityId: brand.id,
      afterState: { attempted: result.attempted, synced: result.synced, failed: result.failed, remaining: result.remaining },
    }).catch((e) => console.error('[analytics/sync] 寫入 activity 失敗', e));
    return json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[analytics/sync] 同步失敗', message);
    return error(message || '同步成效失敗', 500);
  }
