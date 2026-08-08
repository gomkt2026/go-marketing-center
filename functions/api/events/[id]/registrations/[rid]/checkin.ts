import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { rowToCamel } from '../../../../../_shared/case';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import { getEventById } from '../../../../../_shared/events';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const registrationId = context.params.rid as string;
  const event = await getEventById(context.env, eventId);
  if (!event) return error('Event not found', 404);

  const body = await context.request.json().catch(() => ({})) as { action?: 'check_in' | 'undo' };
  const action = body.action ?? 'check_in';

  const sql = getSql(context.env);
  const before = await sql`
    SELECT * FROM event_registrations WHERE id = ${registrationId}::uuid AND event_id = ${eventId}::uuid LIMIT 1
  `;
  if (!before.length) return error('Registration not found', 404);

  const updated = await sql`
    UPDATE event_registrations
    SET checked_in_at = ${action === 'undo' ? null : new Date().toISOString()}
    WHERE id = ${registrationId}::uuid
    RETURNING *
  `;

  await logActivity(context.env, {
    brandId: event.brandId,
    actorType: 'user',
    actorUserId: auth.id,
    action: action === 'undo' ? 'event.checkin_undo' : 'event.checked_in',
    entityType: 'event_registration',
    entityId: registrationId,
    beforeState: before[0],
    afterState: updated[0],
  });

  return json({ registration: rowToCamel(updated[0] as Record<string, unknown>) });
};
