import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { getEventById } from '../../../_shared/events';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const event = await getEventById(context.env, eventId);
  if (!event) return error('Event not found', 404);

  const sql = getSql(context.env);

  const totalsRows = await sql`
    SELECT
      COUNT(*)::int AS total_registrations,
      COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS total_checked_in
    FROM event_registrations
    WHERE event_id = ${eventId}::uuid AND status = 'registered'
  `;
  const totals = totalsRows[0] as { total_registrations: number; total_checked_in: number };

  const sessionRows = await sql`
    SELECT s.id, s.label,
      COUNT(r.id) FILTER (WHERE r.status = 'registered')::int AS registered_count,
      COUNT(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS checked_in_count
    FROM event_sessions s
    LEFT JOIN event_registrations r ON r.session_id = s.id
    WHERE s.event_id = ${eventId}::uuid
    GROUP BY s.id, s.label, s.sort_order
    ORDER BY s.sort_order
  `;

  const referrerRows = await sql`
    SELECT
      ref.id AS referrer_id, ref.name, ref.commission_type, ref.commission_value, ref.is_active,
      COUNT(r.id) FILTER (WHERE r.status = 'registered')::int AS registration_count,
      COUNT(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS checked_in_count
    FROM event_referrers ref
    LEFT JOIN event_registrations r ON r.referrer_id = ref.id
    WHERE ref.event_id = ${eventId}::uuid
    GROUP BY ref.id, ref.name, ref.commission_type, ref.commission_value, ref.is_active, ref.sort_order
    ORDER BY ref.sort_order
  `;

  const otherReferrerRows = await sql`
    SELECT referrer_name, COUNT(*)::int AS registration_count,
      COUNT(*) FILTER (WHERE checked_in_at IS NOT NULL)::int AS checked_in_count
    FROM event_registrations
    WHERE event_id = ${eventId}::uuid AND referrer_id IS NULL AND referrer_name IS NOT NULL AND status = 'registered'
    GROUP BY referrer_name
  `;

  const price = event.price ?? 0;
  const referrerStats = (referrerRows as {
    referrer_id: string; name: string; commission_type: 'percentage' | 'fixed';
    commission_value: number; is_active: boolean; registration_count: number; checked_in_count: number;
  }[]).map((r) => {
    const commissionAmount = r.commission_type === 'percentage'
      ? Math.round(r.checked_in_count * price * (Number(r.commission_value) / 100))
      : Math.round(r.checked_in_count * Number(r.commission_value));
    return {
      referrerId: r.referrer_id,
      name: r.name,
      commissionType: r.commission_type,
      commissionValue: Number(r.commission_value),
      isActive: r.is_active,
      registrationCount: r.registration_count,
      checkedInCount: r.checked_in_count,
      commissionAmount,
    };
  });

  const otherReferrerStats = (otherReferrerRows as {
    referrer_name: string; registration_count: number; checked_in_count: number;
  }[]).map((r) => ({
    referrerId: null,
    name: r.referrer_name,
    commissionType: null,
    commissionValue: null,
    isActive: null,
    registrationCount: r.registration_count,
    checkedInCount: r.checked_in_count,
    commissionAmount: null,
  }));

  return json({
    totalRegistrations: totals.total_registrations,
    totalCheckedIn: totals.total_checked_in,
    checkInRate: totals.total_registrations > 0
      ? Number((totals.total_checked_in / totals.total_registrations).toFixed(4))
      : 0,
    sessions: (sessionRows as Record<string, unknown>[]).map((s) => ({
      id: s.id, label: s.label, registeredCount: s.registered_count, checkedInCount: s.checked_in_count,
    })),
    referrers: [...referrerStats, ...otherReferrerStats],
  });
};
