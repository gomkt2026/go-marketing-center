import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { fetchNearbyPois } from '../../_shared/geo-nearby';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return error('請提供 lat / lng', 400);
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return error('座標超出範圍', 400);
  }

  try {
    const pois = await fetchNearbyPois(lat, lng);
    return json({
      pois,
      source: 'openstreetmap',
      radiusM: 800,
      disclaimer: '附近標的來自 OpenStreetMap；示範點另備有公開地標，方便評估生活機能。',
    });
  } catch (err) {
    return json({
      pois: [],
      source: 'openstreetmap',
      radiusM: 800,
      disclaimer: '附近標的暫時抓不到，已先標示據點本身。',
      error: err instanceof Error ? err.message : 'Overpass 失敗',
    });
  }
};
