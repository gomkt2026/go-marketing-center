import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowsToCamel } from '../../../_shared/case';
import { json } from '../../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const url = new URL(context.request.url);
  const search = url.searchParams.get('search')?.trim() ?? '';

  const sql = getSql(context.env);
  const rows = search
    ? await sql`
        SELECT r.*, s.label AS session_label, ref.name AS referrer_display_name
        FROM event_registrations r
        LEFT JOIN event_sessions s ON s.id = r.session_id
        LEFT JOIN event_referrers ref ON ref.id = r.referrer_id
        WHERE r.event_id = ${eventId}::uuid
          AND (r.name ILIKE ${'%' + search + '%'} OR r.phone ILIKE ${'%' + search + '%'})
        ORDER BY r.created_at DESC
      `
    : await sql`
        SELECT r.*, s.label AS session_label, ref.name AS referrer_display_name
        FROM event_registrations r
        LEFT JOIN event_sessions s ON s.id = r.session_id
        LEFT JOIN event_referrers ref ON ref.id = r.referrer_id
        WHERE r.event_id = ${eventId}::uuid
        ORDER BY r.created_at DESC
      `;

  const registrations = rowsToCamel(rows as Record<string, unknown>[]).map((r) => ({
    ...r,
    referrerDisplayName: (r as { referrerDisplayName?: string; referrerName?: string }).referrerDisplayName
      ?? (r as { referrerName?: string }).referrerName
      ?? null,
  }));

  return json({ registrations });
};
