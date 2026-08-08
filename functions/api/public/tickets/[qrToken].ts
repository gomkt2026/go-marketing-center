import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { rowToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const qrToken = context.params.qrToken as string;

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT r.id, r.name, r.phone, r.email, r.line_id, r.qr_token, r.checked_in_at, r.status,
      s.label AS session_label, s.starts_at AS session_starts_at,
      e.slug AS event_slug, e.title AS event_title, e.location AS event_location,
      e.event_date, e.line_add_friend_url
    FROM event_registrations r
    JOIN events e ON e.id = r.event_id
    LEFT JOIN event_sessions s ON s.id = r.session_id
    WHERE r.qr_token = ${qrToken}
    LIMIT 1
  `;

  if (!rows.length) return error('票券不存在', 404);
  return json({ ticket: rowToCamel(rows[0] as Record<string, unknown>) });
};
