import type { Env } from './env';
import { getSql } from './db';
import { rowToCamel, rowsToCamel } from './case';

export interface DbEvent {
  id: string;
  brandId: string;
  campaignId: string | null;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  eventDate: string | null;
  status: 'draft' | 'open' | 'closed' | 'completed';
  staffToken: string;
  formFields: FormFieldDef[];
  price: number | null;
  priceLabel: string | null;
  lineAddFriendUrl: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  options?: string[];
}

export function mapEvent(row: Record<string, unknown>): DbEvent {
  const e = rowToCamel<DbEvent>(row);
  return { ...e, formFields: (row.form_fields as FormFieldDef[]) ?? [] };
}

export async function getEventById(env: Env, id: string): Promise<DbEvent | null> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM events WHERE id = ${id}::uuid LIMIT 1`;
  if (!rows.length) return null;
  return mapEvent(rows[0] as Record<string, unknown>);
}

export async function getEventBySlug(env: Env, slug: string): Promise<DbEvent | null> {
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM events WHERE slug = ${slug} LIMIT 1`;
  if (!rows.length) return null;
  return mapEvent(rows[0] as Record<string, unknown>);
}

export async function getEventSessions(env: Env, eventId: string) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT * FROM event_sessions WHERE event_id = ${eventId}::uuid ORDER BY sort_order, created_at
  `;
  return rowsToCamel(rows as Record<string, unknown>[]);
}

export async function getEventReferrers(env: Env, eventId: string) {
  const sql = getSql(env);
  const rows = await sql`
    SELECT * FROM event_referrers WHERE event_id = ${eventId}::uuid ORDER BY sort_order, created_at
  `;
  return rowsToCamel(rows as Record<string, unknown>[]);
}

export async function getSessionRegisteredCounts(env: Env, eventId: string): Promise<Record<string, number>> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT session_id, COUNT(*)::int AS cnt
    FROM event_registrations
    WHERE event_id = ${eventId}::uuid AND status = 'registered' AND session_id IS NOT NULL
    GROUP BY session_id
  `;
  const out: Record<string, number> = {};
  for (const r of rows as { session_id: string; cnt: number }[]) {
    out[r.session_id] = r.cnt;
  }
  return out;
}
