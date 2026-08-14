import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { adjustVideoJob } from '../../../_shared/video-jobs';

// POST /api/video-jobs/:id/adjust
// { action: 'retitle' | 'cta' | 'subtitle_large' | 'subtitle_standard' | 'pick_candidate', value? }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const body = await context.request.json() as {
    action?: 'retitle' | 'cta' | 'subtitle_large' | 'subtitle_standard' | 'pick_candidate';
    value?: string;
  };
  if (!body.action) return error('請指定微調 action', 400);

  try {
    const job = await adjustVideoJob(context.env, {
      jobId: context.params.id as string,
      action: body.action,
      value: body.value,
    });
    return json({ job });
  } catch (e) {
    return error(e instanceof Error ? e.message : '微調失敗', 400);
  }
};
