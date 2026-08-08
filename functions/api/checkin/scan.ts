import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { getSql } from '../../_shared/db';
import { rowToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { logActivity } from '../../_shared/activity';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json().catch(() => ({})) as { staffToken?: string; qrToken?: string };
  const staffToken = body.staffToken?.trim() ?? '';
  const qrToken = body.qrToken?.trim() ?? '';
  if (!staffToken) return error('缺少報到授權碼', 400);
  if (!qrToken) return error('缺少票券碼', 400);

  const sql = getSql(context.env);
  const eventRows = await sql`SELECT id, brand_id, title FROM events WHERE staff_token = ${staffToken} LIMIT 1`;
  if (!eventRows.length) return error('授權碼無效', 403);
  const event = eventRows[0] as { id: string; brand_id: string; title: string };

  const regRows = await sql`
    SELECT r.*, s.label AS session_label
    FROM event_registrations r
    LEFT JOIN event_sessions s ON s.id = r.session_id
    WHERE r.qr_token = ${qrToken} AND r.event_id = ${event.id}::uuid
    LIMIT 1
  `;
  if (!regRows.length) return error('查無此票券,請確認是否為本活動的報名 QR Code', 404);

  const registration = regRows[0] as { id: string; checked_in_at: string | null; status: string; name: string; session_label: string | null };

  if (registration.status === 'cancelled') {
    return error('此報名已被取消', 400);
  }

  if (registration.checked_in_at) {
    return json({
      ok: true,
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
    brandId: event.brand_id,
    actorType: 'user',
    action: 'event.checked_in',
    entityType: 'event_registration',
    entityId: registration.id,
    afterState: updated[0],
  });

  return json({
    ok: true,
    alreadyCheckedIn: false,
    registration: rowToCamel(updated[0] as Record<string, unknown>),
  });
};
