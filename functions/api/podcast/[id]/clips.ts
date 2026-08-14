import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { proposePodcastClips } from '../../../_shared/video-jobs';
import { logActivity } from '../../../_shared/activity';

// POST /api/podcast/:id/clips
// 從已核准集數產出 2–4 個 30 秒候選,進入策略審核。
// body: { consentScribe?: boolean }
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const episodeId = context.params.id as string;
  let consentScribe = false;
  try {
    const body = await context.request.json() as { consentScribe?: boolean };
    consentScribe = !!body.consentScribe;
  } catch { /* 無 body 視為未同意轉寫 */ }

  try {
    const job = await proposePodcastClips(context.env, {
      episodeId,
      consentScribe,
      createdBy: auth.id,
    });
    await logActivity(context.env, {
      brandId: job.brandId,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'video_job.created',
      entityType: 'video_job',
      entityId: job.id,
      afterState: { sourceType: 'podcast_clip', episodeId, consentScribe },
    });
    return json({ job }, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : '切短影音失敗', 400);
  }
};
