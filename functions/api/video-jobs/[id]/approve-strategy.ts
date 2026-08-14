import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { approveStrategy } from '../../../_shared/video-jobs';
import { logActivity } from '../../../_shared/activity';

// POST /api/video-jobs/:id/approve-strategy
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const body = await context.request.json() as {
    candidateId?: string;
    title?: string;
    cta?: string;
    subtitleStyle?: 'large' | 'standard';
  };
  if (!body.candidateId) return error('請選擇一個候選', 400);

  try {
    const job = await approveStrategy(context.env, {
      jobId: context.params.id as string,
      candidateId: body.candidateId,
      title: body.title,
      cta: body.cta,
      subtitleStyle: body.subtitleStyle,
    });
    await logActivity(context.env, {
      brandId: job.brandId,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'video_job.strategy_approved',
      entityType: 'video_job',
      entityId: job.id,
      afterState: { candidateId: body.candidateId, title: job.title },
    });
    return json({ job });
  } catch (e) {
    return error(e instanceof Error ? e.message : '核准策略失敗', 400);
  }
};
