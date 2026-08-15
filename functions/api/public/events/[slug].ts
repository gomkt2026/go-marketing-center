import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json, error } from '../../../_shared/response';
import { getEventBySlug, getEventSessions, getEventReferrers, getSessionRegisteredCounts } from '../../../_shared/events';
import { getSql } from '../../../_shared/db';
import { mapBrand } from '../../../_shared/queries';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;
  const event = await getEventBySlug(context.env, slug);
  if (!event || event.status === 'draft') return error('活動不存在或尚未開放', 404);

  const [sessions, referrers, registeredCounts] = await Promise.all([
    getEventSessions(context.env, event.id),
    getEventReferrers(context.env, event.id),
    getSessionRegisteredCounts(context.env, event.id),
  ]);

  const sessionsWithRemaining = (sessions as { id: string; capacity: number | null }[]).map((s) => ({
    ...s,
    remaining: s.capacity == null ? null : Math.max(0, s.capacity - (registeredCounts[s.id] ?? 0)),
  }));

  const sql = getSql(context.env);
  const brandRows = await sql`
    SELECT id, slug, name, tagline, primary_color, logo_url, current_version_id
    FROM brands WHERE id = ${event.brandId}::uuid LIMIT 1
  `;
  const brand = brandRows.length ? mapBrand(brandRows[0] as Record<string, unknown>) : null;

  return json({
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      location: event.location,
      eventDate: event.eventDate,
      status: event.status,
      formFields: event.formFields,
      priceLabel: event.priceLabel,
      lineAddFriendUrl: event.lineAddFriendUrl,
    },
    brand: brand ? {
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      primaryColor: brand.primaryColor,
      tagline: brand.tagline,
    } : null,
    sessions: sessionsWithRemaining,
    referrers: (referrers as { isActive: boolean }[]).filter((r) => r.isActive),
  });
};
