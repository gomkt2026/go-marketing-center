import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { ensureCrewVideoRequestTable } from '../../_shared/crew-video-requests';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  try {
    await ensureCrewVideoRequestTable(context.env);
    const sql = getSql(context.env);
    const rows = await sql`
      SELECT id, crew_name, name, phone, line_id, trade, area, focus, message,
             portrait_consent, consented_at,
             status, staff_note, created_at, contacted_at, filmed_at
      FROM crew_video_requests
      ORDER BY created_at DESC
      LIMIT 200
    `;
    return json({ requests: rowsToCamel(rows as Record<string, unknown>[]) });
  } catch (e) {
    console.error('[crew-video-requests/list]', e);
    return error('拍攝需求載入失敗', 500);
  }
};
