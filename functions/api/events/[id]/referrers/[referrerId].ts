import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { rowToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { getEventById } from '../../../../_shared/events';

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const referrerId = context.params.referrerId as string;
  const event = await getEventById(context.env, eventId);
  if (!event) return error('Event not found', 404);

  const body = await context.request.json() as {
    name?: string;
    commissionType?: 'percentage' | 'fixed';
    commissionValue?: number;
    isActive?: boolean;
    sortOrder?: number;
  };

  const sql = getSql(context.env);
  const before = await sql`SELECT * FROM event_referrers WHERE id = ${referrerId}::uuid LIMIT 1`;
  if (!before.length) return error('Referrer not found', 404);
  const b = before[0] as Record<string, unknown>;

  const updated = await sql`
    UPDATE event_referrers SET
      name = ${body.name?.trim() ?? b.name},
      commission_type = ${body.commissionType ?? b.commission_type},
      commission_value = ${body.commissionValue ?? b.commission_value},
      is_active = ${body.isActive ?? b.is_active},
      sort_order = ${body.sortOrder ?? b.sort_order}
    WHERE id = ${referrerId}::uuid
    RETURNING *
  `;

  await logActivity(context.env, {
    brandId: event.brandId,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'event.referrer.updated',
    entityType: 'event_referrer',
    entityId: referrerId,
    beforeState: b,
    afterState: updated[0],
  });

  return json({ referrer: rowToCamel(updated[0] as Record<string, unknown>) });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const referrerId = context.params.referrerId as string;
  const event = await getEventById(context.env, eventId);
  if (!event) return error('Event not found', 404);

  const sql = getSql(context.env);
  const before = await sql`SELECT * FROM event_referrers WHERE id = ${referrerId}::uuid LIMIT 1`;
  if (!before.length) return error('Referrer not found', 404);

  await sql`DELETE FROM event_referrers WHERE id = ${referrerId}::uuid`;

  await logActivity(context.env, {
    brandId: event.brandId,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'event.referrer.deleted',
    entityType: 'event_referrer',
    entityId: referrerId,
    beforeState: before[0],
  });

  return json({ ok: true });
};
