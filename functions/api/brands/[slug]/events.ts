import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { generateToken } from '../../../_shared/token';
import { logActivity } from '../../../_shared/activity';
import { buildEventSlug } from '../../../_shared/events';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT e.*,
      (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status = 'registered')::int AS registration_count,
      (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.checked_in_at IS NOT NULL)::int AS checked_in_count
    FROM events e
    WHERE e.brand_id = ${brand.id}::uuid
    ORDER BY e.created_at DESC
  `;

  const events = rowsToCamel(rows as Record<string, unknown>[]);
  return json({ events });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    title?: string;
    description?: string;
    location?: string;
    eventDate?: string;
    priceLabel?: string;
    price?: number;
    lineAddFriendUrl?: string;
  };

  if (!body.title?.trim()) return error('title is required', 400);

  const eventSlug = buildEventSlug(body.title, generateToken(3));
  const staffToken = generateToken(24);

  const sql = getSql(context.env);
  const inserted = await sql`
    INSERT INTO events (
      brand_id, slug, title, description, location, event_date,
      staff_token, price, price_label, line_add_friend_url, created_by
    ) VALUES (
      ${brand.id}::uuid, ${eventSlug}, ${body.title.trim()}, ${body.description ?? null},
      ${body.location ?? null}, ${body.eventDate ?? null}, ${staffToken},
      ${body.price ?? null}, ${body.priceLabel ?? null}, ${body.lineAddFriendUrl ?? null}, ${auth.id}::uuid
    )
    RETURNING *
  `;
  const event = rowsToCamel(inserted as Record<string, unknown>[])[0];

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'event.created',
    entityType: 'event',
    entityId: (inserted[0] as { id: string }).id,
    afterState: event,
  });

  return json({ event }, 201);
};
