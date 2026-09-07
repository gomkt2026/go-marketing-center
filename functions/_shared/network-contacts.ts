import type { Env } from './env';
import { getSql } from './db';
import { rowsToCamel, rowToCamel } from './case';
import { applyNetworkMigration, isMissingNetwork } from './network-migrate';

export type NetworkContactSource = 'event' | 'business_card' | 'line_chat' | 'manual' | 'csv';
export type NetworkContactStatus = 'pending_review' | 'verified' | 'archived';

export interface NetworkContactDraft {
  name?: string | null;
  nameEn?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  lineId?: string | null;
  lineUserId?: string | null;
  website?: string | null;
  address?: string | null;
  industry?: string | null;
  specialties?: string[] | null;
  serviceRegions?: string[] | null;
  yearsExperience?: number | null;
  acceptsDispatch?: boolean | null;
  chambers?: string | null;
  notes?: string | null;
  rawOcr?: string | null;
  cardImageUrl?: string | null;
  source: NetworkContactSource;
  sourceRef?: string | null;
  eventId?: string | null;
  registrationId?: string | null;
  status?: NetworkContactStatus;
  confidence?: number | null;
  extra?: Record<string, unknown> | null;
}

export interface NetworkContactRecord extends Record<string, unknown> {
  id: string;
  brandId: string;
  name: string;
  nameEn: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  phoneDigits: string | null;
  email: string | null;
  lineId: string | null;
  lineUserId: string | null;
  website: string | null;
  address: string | null;
  industry: string | null;
  specialties: string[];
  serviceRegions: string[];
  yearsExperience: number | null;
  acceptsDispatch: boolean | null;
  chambers: string | null;
  notes: string | null;
  rawOcr: string | null;
  cardImageUrl: string | null;
  source: NetworkContactSource;
  sourceRef: string | null;
  eventId: string | null;
  registrationId: string | null;
  status: NetworkContactStatus;
  confidence: number | null;
  extra: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  eventTitle?: string | null;
}

const SOURCES: NetworkContactSource[] = ['event', 'business_card', 'line_chat', 'manual', 'csv'];
const STATUSES: NetworkContactStatus[] = ['pending_review', 'verified', 'archived'];

export function phoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('886') && digits.length >= 11) digits = `0${digits.slice(3)}`;
  return digits;
}

export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed || null;
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(/[,，、/;／\n]+/).map((item) => item.trim()).filter(Boolean))];
  }
  return [];
}

export function parseDispatch(value: unknown): boolean | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^(是|要|願意|ok|yes|true)$/i.test(text)) return true;
  if (/^(否|不|不要|沒有|no|false)$/i.test(text)) return false;
  return null;
}

export function parseYears(value: unknown): number | null {
  const n = Number(String(value ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 80) return null;
  return Math.round(n);
}

function mergeList(a: unknown, b: unknown): string[] {
  return [...new Set([...asStringList(a), ...asStringList(b)])];
}

function pickText(preferred: string | null | undefined, fallback: unknown): string | null {
  return cleanText(preferred) ?? cleanText(fallback);
}

function mapContact(row: Record<string, unknown>): NetworkContactRecord {
  const contact = rowToCamel<NetworkContactRecord>(row);
  return {
    ...contact,
    specialties: asStringList(contact.specialties),
    serviceRegions: asStringList(contact.serviceRegions),
    extra: contact.extra && typeof contact.extra === 'object' ? contact.extra as Record<string, unknown> : {},
  };
}

export async function ensureNetworkTables(env: Env): Promise<void> {
  try {
    const sql = getSql(env);
    await sql`SELECT 1 FROM network_contacts LIMIT 1`;
  } catch (err) {
    if (!isMissingNetwork(err)) throw err;
    await applyNetworkMigration(env);
  }
}

export async function upsertNetworkContact(
  env: Env,
  brandId: string,
  draft: NetworkContactDraft,
): Promise<{ contact: NetworkContactRecord; created: boolean }> {
  await ensureNetworkTables(env);
  const sql = getSql(env);
  const name = cleanText(draft.name);
  if (!name) throw new Error('人脈至少需要姓名或公司名稱');

  const phone = cleanText(draft.phone);
  const digits = phoneDigits(phone);
  const email = cleanText(draft.email)?.toLowerCase() ?? null;
  const source = SOURCES.includes(draft.source) ? draft.source : 'manual';
  const status = draft.status && STATUSES.includes(draft.status)
    ? draft.status
    : (source === 'manual' ? 'pending_review' : 'verified');

  let existing: Record<string, unknown> | null = null;
  if (draft.registrationId) {
    const rows = await sql`
      SELECT * FROM network_contacts
      WHERE brand_id = ${brandId}::uuid AND registration_id = ${draft.registrationId}::uuid
      LIMIT 1
    `;
    existing = (rows[0] as Record<string, unknown>) ?? null;
  }
  if (!existing && digits) {
    const rows = await sql`
      SELECT * FROM network_contacts
      WHERE brand_id = ${brandId}::uuid AND phone_digits = ${digits}
      LIMIT 1
    `;
    existing = (rows[0] as Record<string, unknown>) ?? null;
  }
  if (!existing && email) {
    const rows = await sql`
      SELECT * FROM network_contacts
      WHERE brand_id = ${brandId}::uuid AND lower(email) = ${email}
      LIMIT 1
    `;
    existing = (rows[0] as Record<string, unknown>) ?? null;
  }

  if (existing) {
    const prev = mapContact(existing);
    const extra = {
      ...(prev.extra ?? {}),
      ...(draft.extra ?? {}),
      sources: [...new Set([
        ...asStringList(prev.extra?.sources),
        prev.source,
        source,
      ])],
    };
    const nextStatus = prev.status === 'archived'
      ? prev.status
      : (status === 'verified' || prev.status === 'verified' ? 'verified' : prev.status);
    const rows = await sql`
      UPDATE network_contacts SET
        name = ${name},
        name_en = ${pickText(draft.nameEn, prev.nameEn)},
        company = ${pickText(draft.company, prev.company)},
        title = ${pickText(draft.title, prev.title)},
        phone = ${phone ?? prev.phone},
        phone_digits = ${digits ?? prev.phoneDigits},
        email = ${email ?? prev.email},
        line_id = ${pickText(draft.lineId, prev.lineId)},
        line_user_id = ${pickText(draft.lineUserId, prev.lineUserId)},
        website = ${pickText(draft.website, prev.website)},
        address = ${pickText(draft.address, prev.address)},
        industry = ${pickText(draft.industry, prev.industry)},
        specialties = ${JSON.stringify(mergeList(prev.specialties, draft.specialties))}::jsonb,
        service_regions = ${JSON.stringify(mergeList(prev.serviceRegions, draft.serviceRegions))}::jsonb,
        years_experience = ${draft.yearsExperience ?? prev.yearsExperience},
        accepts_dispatch = ${draft.acceptsDispatch ?? prev.acceptsDispatch},
        chambers = ${pickText(draft.chambers, prev.chambers)},
        notes = ${pickText(draft.notes, prev.notes)},
        raw_ocr = ${pickText(draft.rawOcr, prev.rawOcr)},
        card_image_url = ${pickText(draft.cardImageUrl, prev.cardImageUrl)},
        source_ref = ${pickText(draft.sourceRef, prev.sourceRef)},
        event_id = ${draft.eventId ?? prev.eventId}::uuid,
        registration_id = ${draft.registrationId ?? prev.registrationId}::uuid,
        status = ${nextStatus},
        confidence = ${draft.confidence ?? prev.confidence},
        extra = ${JSON.stringify(extra)}::jsonb
      WHERE id = ${prev.id}::uuid
      RETURNING *
    `;
    return { contact: mapContact(rows[0] as Record<string, unknown>), created: false };
  }

  const rows = await sql`
    INSERT INTO network_contacts (
      brand_id, name, name_en, company, title, phone, phone_digits, email, line_id, line_user_id,
      website, address, industry, specialties, service_regions, years_experience, accepts_dispatch,
      chambers, notes, raw_ocr, card_image_url, source, source_ref, event_id, registration_id,
      status, confidence, extra
    ) VALUES (
      ${brandId}::uuid, ${name}, ${cleanText(draft.nameEn)}, ${cleanText(draft.company)},
      ${cleanText(draft.title)}, ${phone}, ${digits}, ${email}, ${cleanText(draft.lineId)},
      ${cleanText(draft.lineUserId)}, ${cleanText(draft.website)}, ${cleanText(draft.address)},
      ${cleanText(draft.industry)}, ${JSON.stringify(asStringList(draft.specialties))}::jsonb,
      ${JSON.stringify(asStringList(draft.serviceRegions))}::jsonb, ${draft.yearsExperience ?? null},
      ${draft.acceptsDispatch ?? null}, ${cleanText(draft.chambers)}, ${cleanText(draft.notes)},
      ${cleanText(draft.rawOcr)}, ${cleanText(draft.cardImageUrl)}, ${source},
      ${cleanText(draft.sourceRef)}, ${draft.eventId ?? null}::uuid, ${draft.registrationId ?? null}::uuid,
      ${status}, ${draft.confidence ?? null}, ${JSON.stringify(draft.extra ?? {})}::jsonb
    )
    RETURNING *
  `;
  return { contact: mapContact(rows[0] as Record<string, unknown>), created: true };
}

export async function listNetworkContacts(
  env: Env,
  brandId: string,
  params: { search?: string; source?: string; status?: string; specialty?: string },
): Promise<NetworkContactRecord[]> {
  await ensureNetworkTables(env);
  const sql = getSql(env);
  const search = params.search?.trim() ? `%${params.search.trim()}%` : null;
  const source = params.source && SOURCES.includes(params.source as NetworkContactSource) ? params.source : null;
  const status = params.status && STATUSES.includes(params.status as NetworkContactStatus) ? params.status : null;
  const specialty = params.specialty?.trim() ? `%${params.specialty.trim()}%` : null;

  const rows = await sql`
    SELECT c.*, e.title AS event_title
    FROM network_contacts c
    LEFT JOIN events e ON e.id = c.event_id
    WHERE c.brand_id = ${brandId}::uuid
      AND (${source}::text IS NULL OR c.source = ${source})
      AND (${status}::text IS NULL OR c.status = ${status})
      AND (${search}::text IS NULL OR (
        c.name ILIKE ${search}
        OR COALESCE(c.company, '') ILIKE ${search}
        OR COALESCE(c.phone, '') ILIKE ${search}
        OR COALESCE(c.email, '') ILIKE ${search}
        OR COALESCE(c.industry, '') ILIKE ${search}
        OR COALESCE(c.notes, '') ILIKE ${search}
        OR COALESCE(c.line_id, '') ILIKE ${search}
        OR c.specialties::text ILIKE ${search}
      ))
      AND (${specialty}::text IS NULL OR c.specialties::text ILIKE ${specialty} OR COALESCE(c.industry, '') ILIKE ${specialty})
    ORDER BY
      CASE c.status WHEN 'pending_review' THEN 0 WHEN 'verified' THEN 1 ELSE 2 END,
      c.updated_at DESC
  `;
  return (rows as Record<string, unknown>[]).map(mapContact);
}

export async function getNetworkContact(env: Env, brandId: string, id: string): Promise<NetworkContactRecord | null> {
  await ensureNetworkTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT c.*, e.title AS event_title
    FROM network_contacts c
    LEFT JOIN events e ON e.id = c.event_id
    WHERE c.brand_id = ${brandId}::uuid AND c.id = ${id}::uuid
    LIMIT 1
  `;
  if (!rows.length) return null;
  return mapContact(rows[0] as Record<string, unknown>);
}

export async function networkStats(env: Env, brandId: string) {
  await ensureNetworkTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review,
      COUNT(*) FILTER (WHERE status = 'verified')::int AS verified,
      COUNT(*) FILTER (WHERE source = 'event' OR source = 'csv')::int AS from_events,
      COUNT(*) FILTER (WHERE source = 'business_card')::int AS from_cards,
      COUNT(*) FILTER (WHERE source = 'line_chat')::int AS from_line,
      COUNT(*) FILTER (WHERE accepts_dispatch IS TRUE)::int AS accepts_dispatch
    FROM network_contacts
    WHERE brand_id = ${brandId}::uuid AND status <> 'archived'
  `;
  return rowToCamel(rows[0] as Record<string, unknown>);
}

function answers(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  return raw as Record<string, unknown>;
}

export function draftFromRegistration(row: {
  id: string;
  event_id: string;
  name: string;
  phone: string;
  email?: string | null;
  line_id?: string | null;
  custom_answers?: unknown;
}): NetworkContactDraft {
  const custom = answers(row.custom_answers);
  const chambers = [custom.chambers, custom.chambers_other]
    .flatMap((item) => asStringList(item))
    .join('、') || null;
  return {
    name: row.name,
    company: cleanText(custom.company),
    phone: row.phone,
    email: row.email,
    lineId: row.line_id,
    industry: cleanText(custom.industry),
    specialties: asStringList(custom.expertise ?? custom.specialties),
    yearsExperience: parseYears(custom.years_experience),
    acceptsDispatch: parseDispatch(custom.accept_repair_jobs),
    chambers,
    notes: [
      custom.introducer ? `介紹人:${String(custom.introducer)}` : '',
      custom.how_heard ? `得知管道:${String(custom.how_heard)}` : '',
      custom.uses_site_system ? `案場系統:${String(custom.uses_site_system)}${custom.site_system_name ? ` ${String(custom.site_system_name)}` : ''}` : '',
    ].filter(Boolean).join('；') || null,
    source: 'event',
    sourceRef: row.event_id,
    eventId: row.event_id,
    registrationId: row.id,
    status: 'verified',
    extra: { customAnswers: custom },
  };
}

export async function importEventRegistrations(env: Env, brandId: string): Promise<{ created: number; updated: number; skipped: number }> {
  await ensureNetworkTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT r.id, r.event_id, r.name, r.phone, r.email, r.line_id, r.custom_answers
    FROM event_registrations r
    JOIN events e ON e.id = r.event_id
    WHERE e.brand_id = ${brandId}::uuid AND r.status = 'registered'
    ORDER BY r.created_at ASC
  `;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows as {
    id: string; event_id: string; name: string; phone: string;
    email: string | null; line_id: string | null; custom_answers: unknown;
  }[]) {
    if (!cleanText(row.name) || !phoneDigits(row.phone)) {
      skipped += 1;
      continue;
    }
    const result = await upsertNetworkContact(env, brandId, draftFromRegistration(row));
    if (result.created) created += 1;
    else updated += 1;
  }
  return { created, updated, skipped };
}

const CSV_MAP: Record<string, string> = {
  姓名: 'name',
  手機: 'phone',
  email: 'email',
  'line id': 'lineId',
  公司名稱: 'company',
  產業別: 'industry',
  專長: 'specialties',
  '該產業年資（年）': 'yearsExperience',
  該產業年資: 'yearsExperience',
  是否願意承接修繕中心派案: 'acceptsDispatch',
  現行加入的商會: 'chambers',
  其他商會名稱: 'chambersOther',
  本次活動介紹人: 'introducer',
  如何得知商會: 'howHeard',
  是否用系統做案場管理: 'usesSiteSystem',
};

export function parseNetworkCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = (cols[i] ?? '').trim();
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function draftFromCsvRow(row: Record<string, string>, sourceRef?: string): NetworkContactDraft | null {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const mappedKey = CSV_MAP[key.trim().toLowerCase()] ?? CSV_MAP[key.trim()] ?? '';
    if (mappedKey) mapped[mappedKey] = value;
  }
  const name = cleanText(mapped.name ?? row['姓名']);
  const phone = cleanText(mapped.phone ?? row['手機']);
  if (!name || !phoneDigits(phone)) return null;
  const chambers = [mapped.chambers ?? row['現行加入的商會'], mapped.chambersOther ?? row['其他商會名稱']]
    .filter(Boolean)
    .join('、') || null;
  return {
    name,
    phone,
    email: cleanText(mapped.email ?? row.Email ?? row.email),
    lineId: cleanText(mapped.lineId ?? row['LINE ID']),
    company: cleanText(mapped.company ?? row['公司名稱']),
    industry: cleanText(mapped.industry ?? row['產業別']),
    specialties: asStringList(mapped.specialties ?? row['專長']),
    yearsExperience: parseYears(mapped.yearsExperience ?? row['該產業年資（年）']),
    acceptsDispatch: parseDispatch(mapped.acceptsDispatch ?? row['是否願意承接修繕中心派案']),
    chambers,
    notes: [
      (mapped.introducer ?? row['本次活動介紹人']) ? `介紹人:${mapped.introducer ?? row['本次活動介紹人']}` : '',
      (mapped.howHeard ?? row['如何得知商會']) ? `得知管道:${mapped.howHeard ?? row['如何得知商會']}` : '',
    ].filter(Boolean).join('；') || null,
    source: 'csv',
    sourceRef: sourceRef ?? 'csv',
    status: 'verified',
    extra: { csv: row },
  };
}
