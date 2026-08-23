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
  const rid = context.params.rid as string;
  const event = await getEventById(context.env, eventId);
  if (!event) return error('Event not found', 404);

  const body = await context.request.json() as {
    status?: 'registered' | 'cancelled';
    name?: string;
    phone?: string;
    sessionId?: string | null;
  };

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM event_registrations
    WHERE id = ${rid}::uuid AND event_id = ${eventId}::uuid
    LIMIT 1
  `;
  if (!existing.length) return error('Registration not found', 404);
  const before = existing[0] as Record<string, unknown>;

  const nextStatus = body.status ?? before.status;
  const nextName = body.name?.trim() || before.name;
  const nextPhone = body.phone?.trim() || before.phone;
  const nextSession = body.sessionId !== undefined
    ? (body.sessionId || null)
    : (before.session_id as string | null);

  const updated = await sql`
    UPDATE event_registrations SET
      status = ${nextStatus}::event_registration_status,
      name = ${nextName},
      phone = ${nextPhone},
      session_id = ${nextSession}::uuid
    WHERE id = ${rid}::uuid AND event_id = ${eventId}::uuid
    RETURNING *
  `;

  const registration = rowToCamel(updated[0] as Record<string, unknown>);

  await logActivity(context.env, {
    brandId: event.brandId,
    actorType: 'user',
    actorUserId: auth.id,
    action: nextStatus === 'cancelled' ? 'event.registration.cancelled' : 'event.registration.updated',
    entityType: 'event_registration',
    entityId: rid,
    beforeState: before,
    afterState: registration,
  });

  return json({ registration });
};
