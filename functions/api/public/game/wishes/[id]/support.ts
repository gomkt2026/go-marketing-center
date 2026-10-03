import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { json, error } from '../../../../../_shared/response';
import { supportWish } from '../../../../../_shared/game-board';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const id = String(context.params.id ?? '');
  try {
    const result = await supportWish(context.env, context.request, id);
    if (result === 'limited') return error('按太多次了，先休息一下', 429);
    if (!result) return error('這則留言目前不能按', 404);
    return json({ ok: true, supports: result.supports });
  } catch (e) {
    console.error('[game/wishes/support]', e);
    return error('按讚失敗，請稍後再試', 500);
  }
};
