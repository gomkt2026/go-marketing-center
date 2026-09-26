import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json } from '../../../_shared/response';
import { cacheGet, cacheSet } from '../../../_shared/cache';
import { getCurrentSeason, leaderboardCacheKey, loadLeaderboard } from '../../../_shared/game';

interface PublicBoard {
  season: {
    id: string; name: string; startsAt: string; endsAt: string; prize: string; topN: number;
  } | null;
  entries: { rank: number; nickname: string; phoneMasked: string; score: number }[];
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
  const headers = { 'Cache-Control': 'public, max-age=30' };
  try {
    const season = await getCurrentSeason(context.env);
    const key = leaderboardCacheKey(season?.id ?? null, limit);
    const cached = await cacheGet<PublicBoard>(context.env, key);
    if (cached) return json(cached, 200, headers);

    const rows = await loadLeaderboard(context.env, season?.id ?? null, limit);
    const board: PublicBoard = {
      season: season
        ? {
          id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt,
          prize: season.prize, topN: season.topN,
        }
        : null,
      entries: rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, phoneMasked: r.phoneMasked, score: r.score })),
    };
    await cacheSet(context.env, key, board, 60);
    return json(board, 200, headers);
  } catch (e) {
    console.error('[game/leaderboard]', e);
    return json({ season: null, entries: [] }, 200);
  }
};
