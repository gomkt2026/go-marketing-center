import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { createInterviewEpisode } from '../../_shared/podcast';

// POST /api/podcast/interview:用指定來賓生成一集訪談逐字稿(不合成語音)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const body = await context.request.json().catch(() => ({})) as { guestId?: string };
  if (!body.guestId) return error('缺少 guestId', 400);

  try {
    const result = await createInterviewEpisode(context.env, body.guestId);
    return json(result, 201);
  } catch (e) {
    return error(`生成訪談集失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
