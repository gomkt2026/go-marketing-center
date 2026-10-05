import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json } from '../../../_shared/response';
import { dailyRoadEvent, loadGamePromoBrief, taipeiDateKey } from '../../../_shared/game-daily';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const headers = { 'Cache-Control': 'public, max-age=300' };
  const road = dailyRoadEvent();
  try {
    const brief = await loadGamePromoBrief(context.env, 'taskgo');
    return json({
      date: brief.date,
      road: { id: brief.road.id, title: brief.road.title, line: brief.road.line },
      yesterday: { plays: brief.yesterdayPlays, players: brief.yesterdayPlayers },
      leaders: brief.leaders,
    }, 200, headers);
  } catch (e) {
    console.error('[game/today]', e);
    return json({
      date: taipeiDateKey(),
      road: { id: road.id, title: road.title, line: road.line },
      yesterday: { plays: 0, players: 0 },
      leaders: [],
    }, 200, headers);
  }
};
