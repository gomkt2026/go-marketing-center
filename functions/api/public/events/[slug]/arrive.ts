import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { getSql } from '../../../../_shared/db';
import { rowToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { normalizePhone, isValidTaiwanMobile } from '../../../../_shared/token';
import { getEventBySlug } from '../../../../_shared/events';
import { logActivity } from '../../../../_shared/activity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;
  const event = await getEventBySlug(context.env, slug, context.request);
  if (!event || event.status === 'draft') return error('活動不存在', 404);

  const body = await context.request.json().catch(() => ({})) as { phone?: string; registrationId?: string };
  const phone = normalizePhone(body.phone?.trim() ?? '');
  const registrationId = body.registrationId?.trim() ?? '';
  if (!isValidTaiwanMobile(phone)) return error('請輸入有效的台灣手機號碼', 400);
  if (!UUID_RE.test(registrationId)) return error('查無報名紀錄', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT r.*, s.label AS session_label
    FROM event_registrations r
    LEFT JOIN event_sessions s ON s.id = r.session_id
    WHERE r.id = ${registrationId}::uuid
      AND r.event_id = ${event.id}::uuid
      AND r.phone = ${phone}
      AND r.status = 'registered'
    LIMIT 1
  `;
  if (!rows.length) return error('查無報名紀錄,請確認手機號碼', 404);

  const registration = rows[0] as { id: string; checked_in_at: string | null; session_label: string | null };
  if (registration.checked_in_at) {
    return json({
      alreadyCheckedIn: true,
      registration: rowToCamel(registration as unknown as Record<string, unknown>),
    });
  }

  const updated = await sql`
    UPDATE event_registrations SET checked_in_at = now()
    WHERE id = ${registration.id}::uuid
    RETURNING *
  `;

  await logActivity(context.env, {
    brandId: event.brandId,
    actorType: 'user',
    action: 'event.checked_in',
    entityType: 'event_registration',
    entityId: registration.id,
    afterState: updated[0],
  });

  return json({
    alreadyCheckedIn: false,
    registration: {
      ...rowToCamel(updated[0] as Record<string, unknown>),
      sessionLabel: registration.session_label,
    },
  });
};
