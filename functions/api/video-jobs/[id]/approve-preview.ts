import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { approvePreview } from '../../../_shared/video-jobs';
import { logActivity } from '../../../_shared/activity';

// POST /api/video-jobs/:id/approve-preview
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  try {
    const job = await approvePreview(context.env, context.params.id as string);
    await logActivity(context.env, {
      brandId: job.brandId,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'video_job.preview_approved',
      entityType: 'video_job',
      entityId: job.id,
    });
    return json({ job });
  } catch (e) {
    return error(e instanceof Error ? e.message : '核准預覽失敗', 400);
  }
};
