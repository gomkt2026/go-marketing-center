import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { getSql } from '../../../../_shared/db';
import { rowsToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { normalizePhone } from '../../../../_shared/token';
import { getEventBySlug } from '../../../../_shared/events';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;
  const event = await getEventBySlug(context.env, slug);
  if (!event) return error('活動不存在', 404);

  const body = await context.request.json().catch(() => ({})) as { phone?: string };
  const phone = normalizePhone(body.phone?.trim() ?? '');
  if (!phone) return error('請輸入手機號碼', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT r.id, r.name, r.phone, r.qr_token, r.checked_in_at, r.status, s.label AS session_label
    FROM event_registrations r
    LEFT JOIN event_sessions s ON s.id = r.session_id
    WHERE r.event_id = ${event.id}::uuid AND r.phone = ${phone} AND r.status = 'registered'
    ORDER BY r.created_at ASC
  `;

  if (!rows.length) return error('查無報名紀錄,請確認手機號碼是否正確', 404);

  return json({ registrations: rowsToCamel(rows as Record<string, unknown>[]) });
};
