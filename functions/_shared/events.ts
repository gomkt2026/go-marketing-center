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
  edmImages: EventEdmImage[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventEdmImage {
  id: string;
  label: string;
  url: string;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'textarea' | 'checkbox';
  required?: boolean;
  options?: string[];
}

function parseEdmImages(raw: unknown): EventEdmImage[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as unknown : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const rec = item as Record<string, unknown>;
      const url = typeof rec.url === 'string' ? rec.url.trim() : '';
      if (!url) return [];
      return [{
        id: typeof rec.id === 'string' && rec.id ? rec.id : url,
        label: typeof rec.label === 'string' && rec.label.trim() ? rec.label.trim() : '活動 EDM',
        url,
      }];
    });
  } catch {
    return [];
  }
}

export function mapEvent(row: Record<string, unknown>): DbEvent {
  const e = rowToCamel<DbEvent>(row);
  const raw = row.form_fields ?? (row as { formFields?: unknown }).formFields ?? e.formFields;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) as FormFieldDef[] : raw;
  const rawEdm = row.edm_images ?? (row as { edmImages?: unknown }).edmImages;
  return {
    ...e,
    formFields: Array.isArray(parsed) ? parsed : [],
    edmImages: parseEdmImages(rawEdm),
  };
}

let edmColumnReady = false;

export async function ensureEventEdmColumn(env: Env): Promise<void> {
  if (edmColumnReady) return;
  const sql = getSql(env);
  await sql`ALTER TABLE events ADD COLUMN IF NOT EXISTS edm_images JSONB NOT NULL DEFAULT '[]'`;
  await sql`
    UPDATE events
    SET edm_images = ${JSON.stringify([{
      id: 'meeting-0903',
      label: '商業交流會議',
      url: '/events/fixercowork-edm-0903.jpg',
    }])}::jsonb
    WHERE COALESCE(jsonb_array_length(edm_images), 0) = 0
      AND (
        slug = ${'商業交流會議-高雄-09-03-ba1035'}
        OR title ILIKE ${'%9/03%'}
        OR title ILIKE ${'%09/03%'}
      )
  `;
  edmColumnReady = true;
}

export function buildEventSlug(title: string, suffix: string): string {
  const base = title.trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'event';
  return `${base}-${suffix}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodePathSegment(raw: string): string {
  const trimmed = raw.trim();
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** Cloudflare Pages 對中文動態路由常把 param 留在 percent-encoding，要還原後才能對到 slug。 */
export function eventSlugCandidates(param: string, request?: Request): string[] {
  const found = new Set<string>();
  const push = (value?: string) => {
    if (!value) return;
    const once = decodePathSegment(value);
    found.add(value.trim());
    found.add(once);
    if (once !== value) {
      try {
        found.add(decodeURIComponent(once));
      } catch {
        // already decoded
      }
    }
  };
  push(param);
  if (request) {
    try {
      const path = new URL(request.url).pathname;
      const match = path.match(/\/events\/([^/]+)/);
      if (match?.[1]) push(match[1]);
    } catch {
      // ignore malformed URL
    }
  }
  return [...found].filter(Boolean);
}

const WEEKDAY_ZH: Record<string, string> = {
  Sun: '日', Mon: '一', Tue: '二', Wed: '三', Thu: '四', Fri: '五', Sat: '六',
};

export function formatBizSessionLabel(iso: string, endLabel = '16:30'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = WEEKDAY_ZH[get('weekday')] ?? get('weekday');
  return `${get('month')}/${get('day')}（${weekday}）${get('hour')}:${get('minute')} 入場 · ${endLabel} 結束`;
}

export async function getEventById(env: Env, id: string): Promise<DbEvent | null> {
  await ensureEventEdmColumn(env);
  const sql = getSql(env);
  const rows = await sql`SELECT * FROM events WHERE id = ${id}::uuid LIMIT 1`;
  if (!rows.length) return null;
  return mapEvent(rows[0] as Record<string, unknown>);
}

export async function getEventBySlug(env: Env, slug: string, request?: Request): Promise<DbEvent | null> {
  await ensureEventEdmColumn(env);
  const sql = getSql(env);
  for (const candidate of eventSlugCandidates(slug, request)) {
    const rows = await sql`SELECT * FROM events WHERE slug = ${candidate} LIMIT 1`;
    if (rows.length) return mapEvent(rows[0] as Record<string, unknown>);
    if (UUID_RE.test(candidate)) {
      const byId = await getEventById(env, candidate);
      if (byId) return byId;
    }
  }
  return null;
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
