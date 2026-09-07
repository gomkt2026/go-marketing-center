import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import {
  asStringList,
  cleanText,
  ensureNetworkTables,
  getNetworkContact,
  phoneDigits,
} from '../../../../../_shared/network-contacts';
import { rowToCamel } from '../../../../../_shared/case';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const contact = await getNetworkContact(context.env, brand.id, id);
  if (!contact) return error('找不到這筆人脈', 404);
  return json({ contact });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const existing = await getNetworkContact(context.env, brand.id, id);
  if (!existing) return error('找不到這筆人脈', 404);

  const body = await context.request.json() as Record<string, unknown>;
  const name = cleanText(body.name) ?? existing.name;
  const phone = cleanText(body.phone) ?? existing.phone;
  const sql = getSql(context.env);
  const rows = await sql`
    UPDATE network_contacts SET
      name = ${name},
      name_en = ${cleanText(body.nameEn) ?? existing.nameEn},
      company = ${cleanText(body.company) ?? existing.company},
      title = ${cleanText(body.title) ?? existing.title},
      phone = ${phone},
      phone_digits = ${phoneDigits(phone)},
      email = ${cleanText(body.email) ?? existing.email},
      line_id = ${cleanText(body.lineId) ?? existing.lineId},
      website = ${cleanText(body.website) ?? existing.website},
      address = ${cleanText(body.address) ?? existing.address},
      industry = ${cleanText(body.industry) ?? existing.industry},
      specialties = ${JSON.stringify(body.specialties !== undefined ? asStringList(body.specialties) : existing.specialties)}::jsonb,
      service_regions = ${JSON.stringify(body.serviceRegions !== undefined ? asStringList(body.serviceRegions) : existing.serviceRegions)}::jsonb,
      years_experience = ${body.yearsExperience === undefined ? existing.yearsExperience : Number(body.yearsExperience) || null},
      accepts_dispatch = ${body.acceptsDispatch === undefined ? existing.acceptsDispatch : body.acceptsDispatch as boolean | null},
      chambers = ${cleanText(body.chambers) ?? existing.chambers},
      notes = ${cleanText(body.notes) ?? existing.notes},
      status = ${typeof body.status === 'string' ? body.status : existing.status}
    WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid
    RETURNING *
  `;
  const contact = await getNetworkContact(context.env, brand.id, id);
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'network.contact.updated',
    entityType: 'network_contact',
    entityId: id,
    afterState: rowToCamel(rows[0] as Record<string, unknown>),
  });
  return json({ contact });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  await ensureNetworkTables(context.env);
  const sql = getSql(context.env);
  await sql`DELETE FROM network_contacts WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid`;
  return json({ ok: true });
};
