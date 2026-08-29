import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { getBrandBySlug, getBrandVersion, mapBrand } from '../../_shared/queries';
import { json, error } from '../../_shared/response';
import { applyBrandWebsiteMigration, isMissingWebsiteColumn } from '../../_shared/brand-profile';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const version = await getBrandVersion(context.env, brand.id);
  return json({ brand, version });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    websiteUrl?: string | null;
    websiteNote?: string | null;
  };

  const websiteUrl = body.websiteUrl === undefined
    ? brand.websiteUrl ?? null
    : (body.websiteUrl?.trim() || null);
  const websiteNote = body.websiteNote === undefined
    ? brand.websiteNote ?? null
    : (body.websiteNote?.trim() || null);

  if (websiteUrl && !/^https?:\/\//i.test(websiteUrl)) {
    return error('官方網站請填完整網址,例如 https://example.com', 400);
  }

  const sql = getSql(context.env);
  const run = () => sql`
    UPDATE brands
    SET website_url = ${websiteUrl}, website_note = ${websiteNote}, updated_at = now()
    WHERE id = ${brand.id}::uuid
    RETURNING id, slug, name, tagline, primary_color, logo_url, website_url, website_note, current_version_id
  `;
  let rows;
  try {
    rows = await run();
  } catch (e) {
    if (!isMissingWebsiteColumn(e)) throw e;
    await applyBrandWebsiteMigration(context.env);
    rows = await run();
  }

  return json({ brand: mapBrand(rows[0] as Record<string, unknown>) });
};
