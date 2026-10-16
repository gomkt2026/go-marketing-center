import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { ensureCrewLeadTable } from '../../_shared/crew-leads';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  try {
    await ensureCrewLeadTable(context.env);
    const sql = getSql(context.env);
    const rows = await sql`
      SELECT id, crew_slug, intent, name, phone, line_id, need, place, message,
             status, staff_note, created_at, handed_at
      FROM crew_leads
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return json({ leads: rowsToCamel(rows as Record<string, unknown>[]) });
  } catch (e) {
    console.error('[crew-leads/list]', e);
    return error('工班客源載入失敗', 500);
  }
};
