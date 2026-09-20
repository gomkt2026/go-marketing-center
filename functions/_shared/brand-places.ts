import type { Env } from './env';
import { getSql } from './db';
import { rowsToCamel, rowToCamel } from './case';

export type PlaceKind = 'property' | 'site' | 'store' | 'event' | 'contact';

export interface BrandPlace {
  id: string;
  brandId: string;
  kind: PlaceKind;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  externalRef: string | null;
  source: string;
  note: string | null;
  meta: Record<string, unknown>;
  geocodeStatus: string;
  createdAt: string;
  updatedAt: string;
}

export const DEMO_PLACES: Array<{
  slug: string;
  kind: PlaceKind;
  name: string;
  address: string;
  lat: number;
  lng: number;
  externalRef: string;
  note: string;
}> = [
  { slug: 'homigo', kind: 'property', name: '大安區示範物件', address: '台北市大安區忠孝東路四段223號', lat: 25.0414, lng: 121.554, externalRef: 'homigo-daan-demo', note: '帶看前看街廓與建物外觀。示範點，非真實租約。' },
  { slug: 'homigo', kind: 'property', name: '板橋示範物件', address: '新北市板橋區縣民大道二段7號', lat: 25.0143, lng: 121.4639, externalRef: 'homigo-banqiao-demo', note: '新北租屋帶街廓。示範點。' },
  { slug: 'homigo', kind: 'property', name: '桃園中正路示範物件', address: '桃園市桃園區中正路1221號', lat: 24.9936, lng: 121.301, externalRef: 'homigo-taoyuan-demo', note: '桃園市區周邊。示範點。' },
  { slug: 'taskgo', kind: 'site', name: '信義區示範案場', address: '台北市信義區松仁路28號', lat: 25.0336, lng: 121.5681, externalRef: 'taskgo-xinyi-demo', note: '高樓施工週邊立體檢視。示範點，非真實工地。' },
  { slug: 'taskgo', kind: 'site', name: '西屯示範案場', address: '台中市西屯區台灣大道三段301號', lat: 24.1628, lng: 120.6472, externalRef: 'taskgo-xantun-demo', note: '中部案場週邊與材料車動線。示範點。' },
  { slug: 'taskgo', kind: 'site', name: 'FIXERCOWORK 示範據點', address: '台中市南屯區五權西路二段666號', lat: 24.1449, lng: 120.6417, externalRef: 'taskgo-fixercowork-demo', note: '活動場地／工班據點。示範點。' },
  { slug: 'washgo', kind: 'store', name: '洗楽 中部門市（示範）', address: '台中市西屯區河南路二段262號', lat: 24.1724, lng: 120.6458, externalRef: 'washgo-senraku-demo', note: 'Washgo 場域導入情境。示範座標，請之後換成真實門市。' },
  { slug: 'washgo', kind: 'store', name: '北區到府服務圈（示範）', address: '台中市北區進化路335號', lat: 24.1591, lng: 120.6853, externalRef: 'washgo-beiqu-demo', note: '到府收送半徑預覽。示範點。' },
  { slug: 'washgo', kind: 'store', name: '彰化收送示範站', address: '彰化市中山路二段416號', lat: 24.0808, lng: 120.5383, externalRef: 'washgo-changhua-demo', note: '司機路線與門市關係。示範點。' },
];

export function demoPlacesForBrand(slug: string, brandId = 'demo'): BrandPlace[] {
  return DEMO_PLACES.filter((place) => place.slug === slug).map((place) => ({
    id: place.externalRef,
    brandId,
    kind: place.kind,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    externalRef: place.externalRef,
    source: 'demo',
    note: place.note,
    meta: {},
    geocodeStatus: 'ready',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

export function isMissingPlacesSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?brand_places["']? does not exist/i.test(msg);
}

export async function applyBrandPlacesMigration(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS brand_places (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL DEFAULT 'property',
      name            TEXT NOT NULL,
      address         TEXT,
      lat             DOUBLE PRECISION,
      lng             DOUBLE PRECISION,
      external_ref    TEXT,
      source          TEXT NOT NULL DEFAULT 'manual',
      note            TEXT,
      meta            JSONB NOT NULL DEFAULT '{}',
      geocode_status  TEXT NOT NULL DEFAULT 'ready',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_places_brand_ref
      ON brand_places(brand_id, external_ref)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_brand_places_brand
      ON brand_places(brand_id, kind, updated_at DESC)
  `;
}

export async function seedDemoPlaces(env: Env, brandId: string, slug: string): Promise<void> {
  const sql = getSql(env);
  const rows = DEMO_PLACES.filter((place) => place.slug === slug);
  for (const place of rows) {
    await sql`
      INSERT INTO brand_places (
        brand_id, kind, name, address, lat, lng, external_ref, source, note, geocode_status
      ) VALUES (
        ${brandId}::uuid, ${place.kind}, ${place.name}, ${place.address},
        ${place.lat}, ${place.lng}, ${place.externalRef}, 'demo', ${place.note}, 'ready'
      )
      ON CONFLICT (brand_id, external_ref) DO NOTHING
    `;
  }
}

export async function listBrandPlaces(env: Env, brandId: string): Promise<BrandPlace[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT * FROM brand_places
    WHERE brand_id = ${brandId}::uuid
    ORDER BY kind, name
  `;
  return rowsToCamel(rows as Record<string, unknown>[]) as BrandPlace[];
}

export async function createBrandPlace(env: Env, brandId: string, body: {
  kind?: PlaceKind;
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
}): Promise<BrandPlace> {
  const sql = getSql(env);
  const inserted = await sql`
    INSERT INTO brand_places (
      brand_id, kind, name, address, lat, lng, source, note, geocode_status
    ) VALUES (
      ${brandId}::uuid,
      ${body.kind ?? 'property'},
      ${body.name},
      ${body.address ?? null},
      ${body.lat ?? null},
      ${body.lng ?? null},
      'manual',
      ${body.note ?? null},
      ${body.lat != null && body.lng != null ? 'ready' : 'pending'}
    )
    RETURNING *
  `;
  return rowToCamel(inserted[0] as Record<string, unknown>) as BrandPlace;
}
