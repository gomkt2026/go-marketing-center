import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import {
  listNetworkContacts,
  networkStats,
  upsertNetworkContact,
  type NetworkContactSource,
} from '../../../../_shared/network-contacts';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const url = new URL(context.request.url);
  const contacts = await listNetworkContacts(context.env, brand.id, {
    search: url.searchParams.get('search') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    specialty: url.searchParams.get('specialty') ?? undefined,
  });
  const stats = await networkStats(context.env, brand.id);
  return json({ contacts, stats });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    name?: string;
    company?: string;
    title?: string;
    phone?: string;
    email?: string;
    lineId?: string;
    website?: string;
    address?: string;
    industry?: string;
    specialties?: string[];
    serviceRegions?: string[];
    yearsExperience?: number;
    acceptsDispatch?: boolean | null;
    chambers?: string;
    notes?: string;
    source?: NetworkContactSource;
    status?: 'pending_review' | 'verified' | 'archived';
  };

  if (!body.name?.trim() && !body.company?.trim()) return error('請填姓名或公司', 400);

  try {
    const { contact, created } = await upsertNetworkContact(context.env, brand.id, {
      ...body,
      name: body.name?.trim() || body.company?.trim(),
      source: body.source ?? 'manual',
      status: body.status ?? 'verified',
    });
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: created ? 'network.contact.created' : 'network.contact.updated',
      entityType: 'network_contact',
      entityId: contact.id,
      afterState: { name: contact.name, company: contact.company },
    });
    return json({ contact, created }, created ? 201 : 200);
  } catch (e) {
    return error(e instanceof Error ? e.message : '儲存失敗', 400);
  }
};
