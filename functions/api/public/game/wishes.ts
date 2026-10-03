import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json, error } from '../../../_shared/response';
import { insertWish, listPublicWishes, parseWish } from '../../../_shared/game-board';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const wishes = await listPublicWishes(context.env);
    return json({ wishes }, 200, { 'Cache-Control': 'public, max-age=5' });
  } catch (e) {
    console.error('[game/wishes]', e);
    return json({ wishes: [] });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = await context.request.json() as Record<string, unknown>;
  } catch {
    return error('請重新寫一次再送出', 400);
  }
  const parsed = parseWish(body);
  if (!parsed.ok) {
    if (parsed.error === 'spam') return json({ ok: true });
    return error(parsed.error, 400);
  }
  try {
    const result = await insertWish(context.env, context.request, parsed);
    if (result === 'limited') return error('今天留得有點多，先看看別人寫了什麼', 429);
    return json({ ok: true }, 201);
  } catch (e) {
    console.error('[game/wishes]', e);
    return error('留言送出失敗，請稍後再試', 500);
  }
};
