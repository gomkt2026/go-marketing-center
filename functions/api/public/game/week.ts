import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json } from '../../../_shared/response';
import { emptyWeekPulse, loadWeekPulse, type GameWeekPulse } from '../../../_shared/game-board';

let memo: { exp: number; value: GameWeekPulse } | null = null;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const headers = { 'Cache-Control': 'public, max-age=30' };
  if (memo && memo.exp > Date.now()) return json(memo.value, 200, headers);
  try {
    const value = await loadWeekPulse(context.env);
    memo = { exp: Date.now() + 30_000, value };
    return json(value, 200, headers);
  } catch (e) {
    console.error('[game/week]', e);
    return json(emptyWeekPulse(), 200, headers);
  }
};
