import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';
import { getEventById, getEventReferrers } from '../../../_shared/events';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const referrers = await getEventReferrers(context.env, eventId);
  return json({ referrers });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const event = await getEventById(context.env, eventId);
  if (!event) return error('Event not found', 404);

  const body = await context.request.json() as {
    name?: string;
    commissionType?: 'percentage' | 'fixed';
    commissionValue?: number;
    sortOrder?: number;
  };
  if (!body.name?.trim()) return error('name is required', 400);

  const sql = getSql(context.env);
  const inserted = await sql`
    INSERT INTO event_referrers (event_id, name, commission_type, commission_value, sort_order)
    VALUES (
      ${eventId}::uuid, ${body.name.trim()}, ${body.commissionType ?? 'percentage'},
      ${body.commissionValue ?? 0}, ${body.sortOrder ?? 0}
    )
    RETURNING *
  `;
  const referrer = rowsToCamel(inserted as Record<string, unknown>[])[0];

  await logActivity(context.env, {
    brandId: event.brandId,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'event.referrer.created',
    entityType: 'event_referrer',
    entityId: (inserted[0] as { id: string }).id,
    afterState: referrer,
  });

  return json({ referrer }, 201);
};
