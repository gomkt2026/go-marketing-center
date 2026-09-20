import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import {
  applyBrandPlacesMigration,
  createBrandPlace,
  demoPlacesForBrand,
  isMissingPlacesSchema,
  listBrandPlaces,
  seedDemoPlaces,
  type PlaceKind,
} from '../../../_shared/brand-places';

const KINDS = new Set<PlaceKind>(['property', 'site', 'store', 'event', 'contact']);

async function ensurePlaces(env: Env, brandId: string, slug: string) {
  try {
    return await listBrandPlaces(env, brandId);
  } catch (err) {
    if (!isMissingPlacesSchema(err)) throw err;
    await applyBrandPlacesMigration(env);
    await seedDemoPlaces(env, brandId, slug);
    return listBrandPlaces(env, brandId);
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  try {
    let places = await ensurePlaces(context.env, brand.id, slug);
    if (places.length === 0) {
      await applyBrandPlacesMigration(context.env);
      await seedDemoPlaces(context.env, brand.id, slug);
      places = await listBrandPlaces(context.env, brand.id);
    }
    return json({
      places,
      disclaimer: '示範點用來評估場域地圖。尚未串產品真實租約／案場／門市。',
    });
  } catch (err) {
    return json({
      places: demoPlacesForBrand(slug, brand.id),
      disclaimer: '資料庫尚未套用場域表，先顯示本機示範點。',
      fallback: true,
      error: err instanceof Error ? err.message : '載入場域失敗',
    });
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    kind?: PlaceKind;
    name?: string;
    address?: string;
    lat?: number;
    lng?: number;
    note?: string;
  };
  if (!body.name?.trim()) return error('請填名稱', 400);
  if (body.kind && !KINDS.has(body.kind)) return error('類型不正確', 400);

  try {
    await applyBrandPlacesMigration(context.env);
    const place = await createBrandPlace(context.env, brand.id, {
      kind: body.kind,
      name: body.name.trim(),
      address: body.address?.trim() || null,
      lat: typeof body.lat === 'number' ? body.lat : null,
      lng: typeof body.lng === 'number' ? body.lng : null,
      note: body.note?.trim() || null,
    });
    return json({ place }, 201);
  } catch (err) {
    if (isMissingPlacesSchema(err)) {
      await applyBrandPlacesMigration(context.env);
      return error('資料表剛建立，請再送一次', 409);
    }
    return error(err instanceof Error ? err.message : '新增失敗', 500);
  }
};
