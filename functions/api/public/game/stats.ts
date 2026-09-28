import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json } from '../../../_shared/response';
import { loadEngagement, type GameEngagement } from '../../../_shared/game';

let memo: { exp: number; value: GameEngagement } | null = null;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const headers = { 'Cache-Control': 'public, max-age=5' };
  if (memo && memo.exp > Date.now()) return json(memo.value, 200, headers);
  try {
    const value = await loadEngagement(context.env);
    memo = { exp: Date.now() + 5000, value };
    return json(value, 200, headers);
  } catch (e) {
    console.error('[game/stats]', e);
    return json({
      live: { count: 0, players: [] },
      totals: { plays: 0, completed: 0, minutes: 0, players: 0, todayPlays: 0 },
      topPlayers: [],
    } satisfies GameEngagement, 200);
  }
};
