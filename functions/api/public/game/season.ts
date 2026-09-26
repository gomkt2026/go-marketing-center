import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json } from '../../../_shared/response';
import { getCurrentSeason } from '../../../_shared/game';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const season = await getCurrentSeason(context.env);
    return json({
      season: season
        ? {
          id: season.id, name: season.name, startsAt: season.startsAt, endsAt: season.endsAt,
          prize: season.prize, topN: season.topN,
        }
        : null,
    }, 200, { 'Cache-Control': 'public, max-age=60' });
  } catch (e) {
    console.error('[game/season]', e);
    return json({ season: null }, 200);
  }
};
