export type NearbyKind =
  | 'convenience'
  | 'bus'
  | 'transit'
  | 'landmark'
  | 'school'
  | 'health'
  | 'park'
  | 'daily';

export interface NearbyPoi {
  id: string;
  kind: NearbyKind;
  name: string;
  lat: number;
  lng: number;
  distanceM: number;
  extra?: string;
}

interface OsmTags {
  [key: string]: string | undefined;
}

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
}

type SeedPoi = Omit<NearbyPoi, 'distanceM'>;

const OVERPASS_ENDPOINTS = [
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];

const KIND_LIMIT: Record<NearbyKind, number> = {
  convenience: 10,
  bus: 10,
  transit: 5,
  landmark: 8,
  school: 5,
  health: 5,
  park: 4,
  daily: 6,
};

const cache = new Map<string, { at: number; pois: NearbyPoi[] }>();
const CACHE_MS = 30 * 60 * 1000;

/** 示範點附近的真實公開地標，Overpass 逾時時仍可標在地圖上 */
const DEMO_SEEDS: Array<{ originLat: number; originLng: number; pois: SeedPoi[] }> = [
  {
    originLat: 25.0414, originLng: 121.554,
    pois: [
      { id: 'seed/daan-apollo', kind: 'landmark', name: '阿波羅大廈', lat: 25.041505, lng: 121.553619, extra: '鄰近建物' },
      { id: 'seed/daan-tourism', kind: 'landmark', name: '交通部觀光署', lat: 25.041519, lng: 121.555923 },
      { id: 'seed/daan-mrt', kind: 'transit', name: '捷運忠孝敦化站', lat: 25.041625, lng: 121.550171 },
      { id: 'seed/daan-family1', kind: 'convenience', name: '全家便利商店', lat: 25.042914, lng: 121.556414 },
      { id: 'seed/daan-hilife', kind: 'convenience', name: '萊爾富', lat: 25.042939, lng: 121.555893 },
      { id: 'seed/daan-family2', kind: 'convenience', name: '全家便利商店', lat: 25.038382, lng: 121.551699 },
      { id: 'seed/daan-sogo', kind: 'daily', name: '忠孝SOGO', lat: 25.0416, lng: 121.5489, extra: '百貨' },
      { id: 'seed/daan-yat-sen', kind: 'landmark', name: '國父紀念館', lat: 25.04032, lng: 121.56026 },
      { id: 'seed/daan-park', kind: 'park', name: '國父紀念館園區', lat: 25.0399, lng: 121.5601 },
      { id: 'seed/daan-bus', kind: 'bus', name: '捷運忠孝敦化站（公車站）', lat: 25.04135, lng: 121.55055 },
    ],
  },
  {
    originLat: 25.0143, originLng: 121.4639,
    pois: [
      { id: 'seed/bq-station', kind: 'transit', name: '台鐵／捷運板橋站', lat: 25.01448, lng: 121.46365 },
      { id: 'seed/bq-cityhall', kind: 'landmark', name: '新北市政府', lat: 25.01235, lng: 121.46554 },
      { id: 'seed/bq-mbk', kind: 'daily', name: '板橋大遠百', lat: 25.01405, lng: 121.4632 },
      { id: 'seed/bq-bus', kind: 'bus', name: '捷運板橋站公車站', lat: 25.0147, lng: 121.4629 },
      { id: 'seed/bq-711', kind: 'convenience', name: '7-ELEVEN 縣民門市', lat: 25.01455, lng: 121.4644 },
      { id: 'seed/bq-park', kind: 'park', name: '縣民廣場', lat: 25.0132, lng: 121.4651 },
    ],
  },
  {
    originLat: 24.9936, originLng: 121.301,
    pois: [
      { id: 'seed/ty-jingfu', kind: 'landmark', name: '桃園景福宮', lat: 24.99372, lng: 121.31148 },
      { id: 'seed/ty-station', kind: 'transit', name: '桃園火車站', lat: 24.98928, lng: 121.31326 },
      { id: 'seed/ty-711', kind: 'convenience', name: '7-ELEVEN 中正門市', lat: 24.9939, lng: 121.3018 },
      { id: 'seed/ty-bus', kind: 'bus', name: '中正路公車站', lat: 24.9934, lng: 121.3014 },
      { id: 'seed/ty-office', kind: 'landmark', name: '桃園區公所商圈', lat: 24.9931, lng: 121.3002 },
      { id: 'seed/ty-fam', kind: 'convenience', name: '全家便利商店', lat: 24.9942, lng: 121.3004 },
    ],
  },
  {
    originLat: 25.0336, originLng: 121.5681,
    pois: [
      { id: 'seed/xy-101', kind: 'landmark', name: '台北101', lat: 25.03396, lng: 121.56447 },
      { id: 'seed/xy-mrt', kind: 'transit', name: '捷運台北101/世貿站', lat: 25.03284, lng: 121.56464 },
      { id: 'seed/xy-tcc', kind: 'landmark', name: '台北國際會議中心', lat: 25.0333, lng: 121.5608 },
      { id: 'seed/xy-711', kind: 'convenience', name: '7-ELEVEN 101門市', lat: 25.0337, lng: 121.5649 },
      { id: 'seed/xy-bus', kind: 'bus', name: '世貿中心公車站', lat: 25.0334, lng: 121.5622 },
      { id: 'seed/xy-shin', kind: 'daily', name: '新光三越信義新天地', lat: 25.0356, lng: 121.5673 },
      { id: 'seed/xy-park', kind: 'park', name: '市府轉運站周邊', lat: 25.0387, lng: 121.5648 },
    ],
  },
  {
    originLat: 24.1628, originLng: 120.6472,
    pois: [
      { id: 'seed/xt-maple', kind: 'park', name: '秋紅谷廣場', lat: 24.16195, lng: 120.6454 },
      { id: 'seed/xt-chaoma', kind: 'bus', name: '朝馬公車站', lat: 24.1653, lng: 120.6439 },
      { id: 'seed/xt-711', kind: 'convenience', name: '7-ELEVEN 朝馬門市', lat: 24.1634, lng: 120.6465 },
      { id: 'seed/xt-mall', kind: 'daily', name: '新光三越台中中港店', lat: 24.1646, lng: 120.6478 },
      { id: 'seed/xt-fam', kind: 'convenience', name: '全家便利商店', lat: 24.1619, lng: 120.6481 },
    ],
  },
  {
    originLat: 24.1449, originLng: 120.6417,
    pois: [
      { id: 'seed/fx-fengle', kind: 'park', name: '豐樂雕塑公園', lat: 24.1442, lng: 120.6411 },
      { id: 'seed/fx-711', kind: 'convenience', name: '7-ELEVEN 五權西門市', lat: 24.1454, lng: 120.6426 },
      { id: 'seed/fx-bus', kind: 'bus', name: '五權西路公車站', lat: 24.1451, lng: 120.6412 },
      { id: 'seed/fx-costco', kind: 'daily', name: '好市多南屯店', lat: 24.1496, lng: 120.6419 },
      { id: 'seed/fx-nantun', kind: 'landmark', name: '南屯老街／南屯區公所', lat: 24.1376, lng: 120.6403 },
    ],
  },
  {
    originLat: 24.1724, originLng: 120.6458,
    pois: [
      { id: 'seed/wg-fengjia', kind: 'landmark', name: '逢甲夜市', lat: 24.1762, lng: 120.6464 },
      { id: 'seed/wg-univ', kind: 'school', name: '逢甲大學', lat: 24.1793, lng: 120.647 },
      { id: 'seed/wg-711', kind: 'convenience', name: '7-ELEVEN 河南門市', lat: 24.1728, lng: 120.6465 },
      { id: 'seed/wg-bus', kind: 'bus', name: '河南路公車站', lat: 24.1721, lng: 120.6453 },
      { id: 'seed/wg-fam', kind: 'convenience', name: '全家便利商店', lat: 24.1736, lng: 120.6449 },
      { id: 'seed/wg-park', kind: 'park', name: '福星公園', lat: 24.1749, lng: 120.6432 },
    ],
  },
  {
    originLat: 24.1591, originLng: 120.6853,
    pois: [
      { id: 'seed/bq-yizhong', kind: 'landmark', name: '一中商圈', lat: 24.1507, lng: 120.6854 },
      { id: 'seed/bq-chungyo', kind: 'daily', name: '中友百貨', lat: 24.1521, lng: 120.6849 },
      { id: 'seed/bq-park', kind: 'park', name: '台中公園', lat: 24.1451, lng: 120.6836 },
      { id: 'seed/bq-711', kind: 'convenience', name: '7-ELEVEN 進化門市', lat: 24.1594, lng: 120.6848 },
      { id: 'seed/bq-bus', kind: 'bus', name: '進化路公車站', lat: 24.1588, lng: 120.6856 },
      { id: 'seed/bq-school', kind: 'school', name: '台中一中', lat: 24.1501, lng: 120.6866 },
    ],
  },
  {
    originLat: 24.0808, originLng: 120.5383,
    pois: [
      { id: 'seed/ch-station', kind: 'transit', name: '彰化火車站', lat: 24.08163, lng: 120.53845 },
      { id: 'seed/ch-bus', kind: 'bus', name: '彰化車站公車站', lat: 24.0812, lng: 120.5389 },
      { id: 'seed/ch-711', kind: 'convenience', name: '7-ELEVEN 彰化車站門市', lat: 24.0814, lng: 120.5378 },
      { id: 'seed/ch-bank', kind: 'daily', name: '彰化銀行總行', lat: 24.081, lng: 120.5416 },
      { id: 'seed/ch-bagua', kind: 'landmark', name: '八卦山大佛風景區', lat: 24.0786, lng: 120.5504 },
      { id: 'seed/ch-conf', kind: 'landmark', name: '彰化孔子廟', lat: 24.0807, lng: 120.5437 },
    ],
  },
];

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

function withDistance(pois: SeedPoi[], lat: number, lng: number): NearbyPoi[] {
  return pois
    .map((poi) => ({ ...poi, distanceM: Math.round(haversineM(lat, lng, poi.lat, poi.lng)) }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

function fallbackPois(lat: number, lng: number): NearbyPoi[] {
  let best: { dist: number; pois: SeedPoi[] } | null = null;
  for (const seed of DEMO_SEEDS) {
    const dist = haversineM(lat, lng, seed.originLat, seed.originLng);
    if (!best || dist < best.dist) best = { dist, pois: seed.pois };
  }
  if (!best || best.dist > 180) return [];
  return withDistance(best.pois, lat, lng);
}

function classify(tags: OsmTags): { kind: NearbyKind; extra?: string } | null {
  if (tags.shop === 'convenience') return { kind: 'convenience', extra: tags.brand || tags.operator };
  if (tags.highway === 'bus_stop' || tags.amenity === 'bus_station' || (tags.public_transport === 'platform' && tags.bus === 'yes')) {
    return { kind: 'bus', extra: tags.route_ref || tags.ref };
  }
  if (tags.railway === 'station' || tags.railway === 'halt' || tags.station === 'subway') {
    return { kind: 'transit', extra: tags.network || (tags.station === 'subway' || tags.subway === 'yes' ? '捷運' : '鐵路') };
  }
  if (tags.tourism === 'attraction' || tags.tourism === 'museum' || tags.amenity === 'place_of_worship') {
    return { kind: 'landmark', extra: tags.tourism || tags.religion };
  }
  if (tags.amenity === 'school' || tags.amenity === 'university' || tags.amenity === 'kindergarten') {
    return { kind: 'school' };
  }
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic' || tags.amenity === 'pharmacy' || tags.amenity === 'doctors') {
    return { kind: 'health', extra: tags.amenity };
  }
  if (tags.leisure === 'park') return { kind: 'park' };
  if (tags.shop === 'supermarket' || tags.amenity === 'marketplace' || tags.amenity === 'bank' || tags.amenity === 'post_office' || tags.amenity === 'library' || tags.amenity === 'police') {
    return { kind: 'daily', extra: tags.amenity || tags.shop };
  }
  return null;
}

function displayName(tags: OsmTags, kind: NearbyKind): string {
  const name = tags.name || tags['name:zh'] || tags['name:zh-Hant'] || tags.brand;
  if (name) return name;
  if (kind === 'bus') return tags.ref ? `公車站 ${tags.ref}` : '公車站';
  if (kind === 'convenience') return '便利商店';
  if (kind === 'transit') return '車站';
  if (kind === 'park') return '公園';
  return '附近地標';
}

function buildQuery(lat: number, lng: number): string {
  const n = (radius: number, filter: string) => `node${filter}(around:${radius},${lat},${lng});`;
  return `
[out:json][timeout:8];
(
  ${n(450, '["shop"="convenience"]')}
  ${n(450, '["highway"="bus_stop"]')}
  ${n(800, '["railway"="station"]')}
  ${n(800, '["station"="subway"]')}
  ${n(500, '["leisure"="park"]')}
  ${n(500, '["amenity"="school"]')}
  ${n(700, '["tourism"="attraction"]')}
);
out;
`.trim();
}

function parseElements(elements: OsmElement[], lat: number, lng: number): NearbyPoi[] {
  const seen = new Set<string>();
  const buckets: Record<NearbyKind, NearbyPoi[]> = {
    convenience: [], bus: [], transit: [], landmark: [], school: [], health: [], park: [], daily: [],
  };
  for (const el of elements) {
    const poiLat = el.lat ?? el.center?.lat;
    const poiLng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    if (poiLat == null || poiLng == null) continue;
    const classified = classify(tags);
    if (!classified) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    buckets[classified.kind].push({
      id,
      kind: classified.kind,
      name: displayName(tags, classified.kind),
      lat: poiLat,
      lng: poiLng,
      distanceM: Math.round(haversineM(lat, lng, poiLat, poiLng)),
      extra: classified.extra,
    });
  }
  const pois: NearbyPoi[] = [];
  (Object.keys(KIND_LIMIT) as NearbyKind[]).forEach((kind) => {
    buckets[kind]
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, KIND_LIMIT[kind])
      .forEach((poi) => pois.push(poi));
  });
  return pois.sort((a, b) => a.distanceM - b.distanceM);
}

async function fetchOverpass(query: string): Promise<OsmElement[]> {
  let lastError: Error | null = null;
  for (const endpoint of OVERPASS_ENDPOINTS.slice(0, 2)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'go-marketing-center/geo-nearby',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastError = new Error(`Overpass ${res.status}`);
        continue;
      }
      const data = await res.json() as { elements?: OsmElement[] };
      return data.elements ?? [];
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error('Overpass failed');
    }
  }
  throw lastError ?? new Error('Overpass failed');
}

export async function fetchNearbyPois(lat: number, lng: number): Promise<NearbyPoi[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.pois;

  const seeded = fallbackPois(lat, lng);
  if (seeded.length >= 5) {
    cache.set(key, { at: Date.now(), pois: seeded });
    return seeded;
  }
  try {
    const live = parseElements(await fetchOverpass(buildQuery(lat, lng)), lat, lng);
    const merged = mergePois(live, seeded);
    cache.set(key, { at: Date.now(), pois: merged });
    return merged;
  } catch {
    cache.set(key, { at: Date.now(), pois: seeded });
    return seeded;
  }
}

function mergePois(live: NearbyPoi[], seeded: NearbyPoi[]): NearbyPoi[] {
  if (!live.length) return seeded;
  const seen = new Set(live.map((poi) => `${poi.name}|${poi.lat.toFixed(4)}|${poi.lng.toFixed(4)}`));
  const extra = seeded.filter((poi) => !seen.has(`${poi.name}|${poi.lat.toFixed(4)}|${poi.lng.toFixed(4)}`));
  return [...live, ...extra].sort((a, b) => a.distanceM - b.distanceM).slice(0, 40);
}
