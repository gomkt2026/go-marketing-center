import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json } from '../../../_shared/response';
import { cacheGet, cacheSet } from '../../../_shared/cache';
import {
  getCurrentSeason, leaderboardCacheKey, loadLeaderboard, toGameMap, type GameMap,
} from '../../../_shared/game';

interface PublicBoard {
  map: GameMap;
  scope: 'season' | 'all';
  season: {
    id: string; name: string; startsAt: string; endsAt: string; prize: string; topN: number; prizeMap: GameMap;
  } | null;
  entries: { rank: number; nickname: string; phoneMasked: string; score: number }[];
}

/** ?map=s|m|l|t（預設 s）；?scope=all 強制看總榜，否則有進行中的賽季就看賽季榜。 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit')) || 10));
  const map = toGameMap(url.searchParams.get('map'));
  const forceAll = url.searchParams.get('scope') === 'all';
  const headers = { 'Cache-Control': 'public, max-age=30' };
  try {
    const season = await getCurrentSeason(context.env);
    const boardSeasonId = forceAll ? null : season?.id ?? null;
    const key = leaderboardCacheKey(boardSeasonId, map, limit);
    const cached = await cacheGet<PublicBoard>(context.env, key);
    if (cached && cached.season?.id === season?.id) return json(cached, 200, headers);

    const rows = await loadLeaderboard(context.env, boardSeasonId, map, limit);
    const board: PublicBoard = {
      map,
      scope: boardSeasonId ? 'season' : 'all',
      season: season
        ? {
          id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt,
          prize: season.prize, topN: season.topN, prizeMap: season.prizeMap,
        }
        : null,
      entries: rows.map((r, i) => ({ rank: i + 1, nickname: r.nickname, phoneMasked: r.phoneMasked, score: r.score })),
    };
    await cacheSet(context.env, key, board, 60);
    return json(board, 200, headers);
  } catch (e) {
    console.error('[game/leaderboard]', e);
    return json({ map, scope: 'all', season: null, entries: [] }, 200);
  }
};
