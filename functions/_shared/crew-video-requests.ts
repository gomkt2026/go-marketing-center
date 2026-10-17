import type { Env } from './env';
import { getSql } from './db';
import { isValidTaiwanMobile, normalizePhone } from './token';

export const CREW_VIDEO_FOCUSES = ['intro', 'before_after', 'process', 'unsure'] as const;
export type CrewVideoFocus = (typeof CREW_VIDEO_FOCUSES)[number];
export type CrewVideoStatus = 'new' | 'scheduled' | 'filmed' | 'closed';

export interface CrewVideoRequestInput {
  crewName: string;
  name: string;
  phone: string;
  lineId: string;
  trade: string;
  area: string;
  focus: CrewVideoFocus;
  message: string;
  allianceIntent: true;
  portraitConsent: true;
}

const LIMITS = { crew: 40, name: 40, line: 40, trade: 80, area: 80, message: 500 };

export function parseCrewVideoRequest(body: Record<string, unknown>): { ok: true; value: CrewVideoRequestInput } | { ok: false; error: string } {
  if (typeof body.website === 'string' && body.website.trim()) {
    return { ok: false, error: 'spam' };
  }
  const crewName = clip(body.crewName, LIMITS.crew);
  const name = clip(body.name, LIMITS.name);
  const phone = normalizePhone(clip(body.phone, 20));
  const lineId = clip(body.lineId, LIMITS.line);
  const trade = clip(body.trade, LIMITS.trade);
  const area = clip(body.area, LIMITS.area);
  const message = clip(body.message, LIMITS.message);
  if (!crewName) return { ok: false, error: '請填寫工班名稱' };
  if (!name) return { ok: false, error: '請填寫怎麼稱呼' };
  if (!isValidTaiwanMobile(phone)) return { ok: false, error: '請輸入有效的台灣手機號碼' };
  if (!trade) return { ok: false, error: '請填寫做哪一種' };
  if (body.allianceIntent !== true) return { ok: false, error: '請勾選已有意願加入 FIXERCOWORK 修繕聯盟' };
  if (body.portraitConsent !== true) return { ok: false, error: '請勾選同意在修繕聯盟中露出' };
  return {
    ok: true,
    value: { crewName, name, phone, lineId, trade, area, focus: 'intro', message, allianceIntent: true, portraitConsent: true },
  };
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function ensureCrewVideoRequestTable(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS crew_video_requests (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      crew_name     TEXT NOT NULL,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      line_id       TEXT,
      trade         TEXT NOT NULL,
      area          TEXT,
      focus         TEXT NOT NULL,
      message       TEXT,
      status        TEXT NOT NULL DEFAULT 'new',
      staff_note    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      contacted_at  TIMESTAMPTZ,
      filmed_at     TIMESTAMPTZ,
      portrait_consent BOOLEAN NOT NULL DEFAULT false,
      consented_at  TIMESTAMPTZ,
      alliance_intent BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT crew_video_requests_focus_check CHECK (focus IN ('intro', 'before_after', 'process', 'unsure')),
      CONSTRAINT crew_video_requests_status_check CHECK (status IN ('new', 'scheduled', 'filmed', 'closed'))
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_crew_video_requests_created
      ON crew_video_requests (created_at DESC)
  `;
  await sql`ALTER TABLE crew_video_requests ADD COLUMN IF NOT EXISTS portrait_consent BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE crew_video_requests ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ`;
  await sql`ALTER TABLE crew_video_requests ADD COLUMN IF NOT EXISTS alliance_intent BOOLEAN NOT NULL DEFAULT false`;
}

/** 同一支手機 24 小時內不重複建一筆拍攝需求。 */
export async function recentCrewVideoRequest(env: Env, phone: string): Promise<boolean> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT 1 FROM crew_video_requests
    WHERE phone = ${phone}
      AND created_at > now() - interval '24 hours'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function insertCrewVideoRequest(env: Env, input: CrewVideoRequestInput): Promise<void> {
  const sql = getSql(env);
  await sql`
    INSERT INTO crew_video_requests (
      crew_name, name, phone, line_id, trade, area, focus, message,
      portrait_consent, consented_at, alliance_intent
    )
    VALUES (
      ${input.crewName},
      ${input.name},
      ${input.phone},
      ${input.lineId || null},
      ${input.trade},
      ${input.area || null},
      ${input.focus},
      ${input.message || null},
      ${input.portraitConsent},
      now(),
      ${input.allianceIntent}
    )
  `;
}
