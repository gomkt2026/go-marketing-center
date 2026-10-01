import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error('找不到這筆需求', 404);

  let body: { status?: string; staffNote?: string };
  try {
    body = await context.request.json() as { status?: string; staffNote?: string };
  } catch {
    return error('請重新儲存', 400);
  }

  const status = body.status === 'contacted' || body.status === 'new' ? body.status : null;
  const staffNote = typeof body.staffNote === 'string' ? body.staffNote.trim().slice(0, 500) : null;
  if (!status && staffNote === null) return error('沒有可更新的內容', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    UPDATE posting_inquiries
    SET
      status = COALESCE(${status}, status),
      staff_note = COALESCE(${staffNote}, staff_note),
      contacted_at = CASE
        WHEN ${status} = 'contacted' AND contacted_at IS NULL THEN now()
        WHEN ${status} = 'new' THEN NULL
        ELSE contacted_at
      END
    WHERE id = ${id}::uuid
    RETURNING id
  `;
  if (!rows.length) return error('找不到這筆需求', 404);
  return json({ ok: true });
};
