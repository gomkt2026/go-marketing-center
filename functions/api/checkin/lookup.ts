import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { normalizePhone } from '../../_shared/token';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json().catch(() => ({})) as { staffToken?: string; query?: string };
  const staffToken = body.staffToken?.trim() ?? '';
  const query = body.query?.trim() ?? '';
  if (!staffToken) return error('缺少報到授權碼', 400);
  if (query.length < 2) return error('請至少輸入兩個字', 400);

  const sql = getSql(context.env);
  const eventRows = await sql`SELECT id FROM events WHERE staff_token = ${staffToken} LIMIT 1`;
  if (!eventRows.length) return error('授權碼無效', 403);
  const eventId = (eventRows[0] as { id: string }).id;

  const safe = query.replace(/[%_]/g, '');
  const like = `%${safe}%`;
  const phone = normalizePhone(query);
  const digits = query.replace(/\D/g, '');
  const phoneTail = digits.length >= 4 ? `%${digits}` : '';

  const rows = await sql`
    SELECT r.id, r.name, r.phone, r.checked_in_at, r.status, s.label AS session_label
    FROM event_registrations r
    LEFT JOIN event_sessions s ON s.id = r.session_id
    WHERE r.event_id = ${eventId}::uuid
      AND r.status = 'registered'
      AND (
        r.name ILIKE ${like}
        OR r.phone = ${phone}
        OR (${phoneTail} <> '' AND r.phone LIKE ${phoneTail})
      )
    ORDER BY r.checked_in_at NULLS FIRST, r.name
    LIMIT 8
  `;

  return json({ matches: rowsToCamel(rows as Record<string, unknown>[]) });
};
