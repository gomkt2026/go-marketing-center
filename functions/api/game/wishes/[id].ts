import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = String(context.params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return error('找不到這則留言', 404);

  let body: { status?: string };
  try {
    body = await context.request.json() as { status?: string };
  } catch {
    return error('請重新儲存', 400);
  }
  if (body.status !== 'visible' && body.status !== 'hidden') return error('狀態不正確', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    UPDATE game_wishes SET status = ${body.status}
    WHERE id = ${id}::uuid
    RETURNING id
  `;
  if (!rows.length) return error('找不到這則留言', 404);
  return json({ ok: true });
};
