import type { Env } from './env';
import { getSql } from './db';
import { isValidTaiwanMobile, normalizePhone } from './token';

export type InquiryStatus = 'new' | 'contacted';

export interface InquiryInput {
  name: string;
  phone: string;
  lineId: string;
  trade: string;
  message: string;
}

export interface InquiryRow {
  id: string;
  name: string;
  phone: string;
  lineId: string | null;
  trade: string;
  message: string | null;
  status: InquiryStatus;
  staffNote: string | null;
  createdAt: string;
  contactedAt: string | null;
}

const LIMITS = { name: 40, line: 40, trade: 80, message: 500 };

export function parseInquiry(body: Record<string, unknown>): { ok: true; value: InquiryInput } | { ok: false; error: string } {
  if (typeof body.website === 'string' && body.website.trim()) {
    return { ok: false, error: 'spam' };
  }
  const name = clip(body.name, LIMITS.name);
  const phone = normalizePhone(clip(body.phone, 20));
  const lineId = clip(body.lineId, LIMITS.line);
  const trade = clip(body.trade, LIMITS.trade);
  const message = clip(body.message, LIMITS.message);
  if (!name) return { ok: false, error: '請填寫姓名' };
  if (!isValidTaiwanMobile(phone)) return { ok: false, error: '請輸入有效的台灣手機號碼' };
  if (!trade) return { ok: false, error: '請填寫行業或店名' };
  return { ok: true, value: { name, phone, lineId, trade, message } };
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function ensureInquiryTable(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS posting_inquiries (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      line_id       TEXT,
      trade         TEXT NOT NULL,
      message       TEXT,
      status        TEXT NOT NULL DEFAULT 'new',
      staff_note    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      contacted_at  TIMESTAMPTZ,
      CONSTRAINT posting_inquiries_status_check CHECK (status IN ('new', 'contacted'))
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_posting_inquiries_created
      ON posting_inquiries (created_at DESC)
  `;
}

/** 同一支手機 24 小時內已留過，就不重複建一筆。 */
export async function recentInquiry(env: Env, phone: string): Promise<boolean> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT 1 FROM posting_inquiries
    WHERE phone = ${phone}
      AND created_at > now() - interval '24 hours'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function insertInquiry(env: Env, input: InquiryInput): Promise<void> {
  const sql = getSql(env);
  await sql`
    INSERT INTO posting_inquiries (name, phone, line_id, trade, message)
    VALUES (
      ${input.name},
      ${input.phone},
      ${input.lineId || null},
      ${input.trade},
      ${input.message || null}
    )
  `;
}
