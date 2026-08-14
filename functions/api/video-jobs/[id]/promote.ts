import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { promoteVideoJobToContent } from '../../../_shared/video-jobs';
import { logActivity } from '../../../_shared/activity';

// POST /api/video-jobs/:id/promote
// { platform: 'instagram' | 'threads' | 'facebook' }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const body = await context.request.json() as { platform?: string };
  const platform = body.platform ?? 'instagram';
  if (platform !== 'instagram' && platform !== 'threads' && platform !== 'facebook') {
    return error('platform 必須是 instagram / threads / facebook', 400);
  }

  try {
    const result = await promoteVideoJobToContent(context.env, {
      jobId: context.params.id as string,
      platform,
      createdBy: auth.id,
    });
    await logActivity(context.env, {
      brandId: result.job.brandId,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'video_job.promoted',
      entityType: 'content',
      entityId: result.contentId,
      afterState: { videoJobId: result.job.id, platform },
    });
    return json(result, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : '寫入內容中心失敗', 400);
  }
};
