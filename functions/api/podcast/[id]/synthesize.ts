import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { synthesizeNextSegment } from '../../../_shared/podcast';

// POST /api/podcast/:id/synthesize:合成下一個還沒有音檔的段落。
// 單次只做一段(一段約 30-60 秒),前端重複呼叫直到 done=true;全部完成後狀態轉 ready_for_review。
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const episodeId = context.params.id as string;
  try {
    const progress = await synthesizeNextSegment(context.env, episodeId);
    return json(progress);
  } catch (e) {
    return error(`語音合成失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
