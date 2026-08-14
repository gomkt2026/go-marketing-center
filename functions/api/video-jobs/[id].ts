import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { getVideoJob, publicVideoUrls, rejectVideoJob } from '../../_shared/video-jobs';

// GET /api/video-jobs/:id
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const job = await getVideoJob(context.env, context.params.id as string);
  if (!job) return error('找不到短影音工作', 404);
  return json({ job, urls: publicVideoUrls(context.env, job) });
};

// POST /api/video-jobs/:id  { action: 'reject', reason? }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const body = await context.request.json() as { action?: string; reason?: string };
  if (body.action !== 'reject') return error('僅支援 action=reject', 400);
  try {
    const job = await rejectVideoJob(context.env, context.params.id as string, body.reason);
    return json({ job });
  } catch (e) {
    return error(e instanceof Error ? e.message : '打回失敗', 400);
  }
};
