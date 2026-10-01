import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { ensureInquiryTable } from '../../_shared/inquiries';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  try {
    await ensureInquiryTable(context.env);
    const sql = getSql(context.env);
    const rows = await sql`
      SELECT id, name, phone, line_id, trade, message, status, staff_note, created_at, contacted_at
      FROM posting_inquiries
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return json({ inquiries: rowsToCamel(rows as Record<string, unknown>[]) });
  } catch (e) {
    console.error('[inquiries/list]', e);
    return error('需求清單載入失敗', 500);
  }
};
