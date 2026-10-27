import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json().catch(() => ({})) as { staffToken?: string };
  const staffToken = body.staffToken?.trim() ?? '';
  if (!staffToken) return error('請輸入報到授權碼', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT e.id, e.slug, e.title, e.location, e.event_date, e.status,
      COUNT(*) FILTER (WHERE r.status = 'registered')::int AS registered_count,
      COUNT(*) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS checked_in_count
    FROM events e
    LEFT JOIN event_registrations r ON r.event_id = e.id
    WHERE e.staff_token = ${staffToken}
    GROUP BY e.id
    LIMIT 1
  `;
  if (!rows.length) return error('授權碼無效,請確認連結是否正確', 404);

  const event = rows[0] as {
    id: string; slug: string; title: string; location: string | null;
    event_date: string | null; status: string; registered_count: number; checked_in_count: number;
  };
  return json({
    eventId: event.id,
    eventSlug: event.slug,
    title: event.title,
    location: event.location,
    eventDate: event.event_date,
    status: event.status,
    registeredCount: event.registered_count,
    checkedInCount: event.checked_in_count,
  });
};
