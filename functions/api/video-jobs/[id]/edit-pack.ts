import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { getVideoJob, publicVideoUrls } from '../../../_shared/video-jobs';

// GET /api/video-jobs/:id/edit-pack
// 給本機 Skill / 渲染 Container 下載完整契約包。
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const job = await getVideoJob(context.env, context.params.id as string);
  if (!job) return error('找不到短影音工作', 404);
  if (!job.editPack) return error('策略尚未核准,還沒有 edit pack', 400);

  return json({
    pack: job.editPack,
    edl: job.edl,
    srt: job.srt,
    strategy: job.strategy,
    urls: publicVideoUrls(context.env, job),
    renderHint: {
      preview: 'python3 scripts/render-short-video.py --job ' + job.id + ' --mode preview',
      final: 'python3 scripts/render-short-video.py --job ' + job.id + ' --mode final',
      uploadPreview: `POST /api/video-jobs/${job.id}/render-result  kind=preview`,
      uploadFinal: `POST /api/video-jobs/${job.id}/render-result  kind=final`,
    },
  });
};
