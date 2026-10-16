import type { Env } from './env';
import { getSql } from './db';
import { isValidTaiwanMobile, normalizePhone } from './token';

/** 與 src/data/alliance-crews.ts 的 slug 保持一致。 */
export const CREW_SLUGS = ['hao', 'shanqi', 'deco', 'bedding', 'clean'] as const;

export type CrewLeadIntent = 'customer' | 'partner';
export type CrewLeadStatus = 'new' | 'handed' | 'closed';

export interface CrewLeadInput {
  crewSlug: string;
  intent: CrewLeadIntent;
  name: string;
  phone: string;
  lineId: string;
  need: string;
  place: string;
  message: string;
}

const LIMITS = { name: 40, line: 40, need: 120, place: 80, message: 500 };

export function parseCrewLead(body: Record<string, unknown>): { ok: true; value: CrewLeadInput } | { ok: false; error: string } {
  if (typeof body.website === 'string' && body.website.trim()) {
    return { ok: false, error: 'spam' };
  }
  const crewSlug = typeof body.crewSlug === 'string' ? body.crewSlug.trim() : '';
  if (!CREW_SLUGS.includes(crewSlug as (typeof CREW_SLUGS)[number])) {
    return { ok: false, error: '請從工班頁重新留言' };
  }
  const intent: CrewLeadIntent | null = body.intent === 'partner' ? 'partner' : body.intent === 'customer' ? 'customer' : null;
  if (!intent) return { ok: false, error: '請選擇你是客戶還是合作工班' };
  const name = clip(body.name, LIMITS.name);
  const phone = normalizePhone(clip(body.phone, 20));
  const lineId = clip(body.lineId, LIMITS.line);
  const need = clip(body.need, LIMITS.need);
  const place = clip(body.place, LIMITS.place);
  const message = clip(body.message, LIMITS.message);
  if (!name) return { ok: false, error: '請填寫怎麼稱呼' };
  if (!isValidTaiwanMobile(phone)) return { ok: false, error: '請輸入有效的台灣手機號碼' };
  if (!need) return { ok: false, error: '請寫一下想做什麼' };
  return { ok: true, value: { crewSlug, intent, name, phone, lineId, need, place, message } };
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function ensureCrewLeadTable(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS crew_leads (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      crew_slug     TEXT NOT NULL,
      intent        TEXT NOT NULL,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      line_id       TEXT,
      need          TEXT NOT NULL,
      place         TEXT,
      message       TEXT,
      status        TEXT NOT NULL DEFAULT 'new',
      staff_note    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      handed_at     TIMESTAMPTZ,
      CONSTRAINT crew_leads_intent_check CHECK (intent IN ('customer', 'partner')),
      CONSTRAINT crew_leads_status_check CHECK (status IN ('new', 'handed', 'closed'))
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_crew_leads_created
      ON crew_leads (created_at DESC)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_crew_leads_crew
      ON crew_leads (crew_slug, created_at DESC)
  `;
}

/** 同一支手機、同一組工班，24 小時內不重複建一筆。 */
export async function recentCrewLead(env: Env, phone: string, crewSlug: string): Promise<boolean> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT 1 FROM crew_leads
    WHERE phone = ${phone}
      AND crew_slug = ${crewSlug}
      AND created_at > now() - interval '24 hours'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function insertCrewLead(env: Env, input: CrewLeadInput): Promise<void> {
  const sql = getSql(env);
  await sql`
    INSERT INTO crew_leads (crew_slug, intent, name, phone, line_id, need, place, message)
    VALUES (
      ${input.crewSlug},
      ${input.intent},
      ${input.name},
      ${input.phone},
      ${input.lineId || null},
      ${input.need},
      ${input.place || null},
      ${input.message || null}
    )
  `;
}
