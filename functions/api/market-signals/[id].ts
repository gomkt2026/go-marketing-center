import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowToCamel } from '../../_shared/case';
import { logActivity } from '../../_shared/activity';
import { json, error } from '../../_shared/response';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  const body = await context.request.json() as { status?: string };
  if (!body.status) return error('status is required', 400);

  const sql = getSql(context.env);
  const before = await sql`SELECT * FROM market_signals WHERE id = ${id}::uuid LIMIT 1`;
  if (!before.length) return error('Not found', 404);

  const updated = await sql`
    UPDATE market_signals SET status = ${body.status}
    WHERE id = ${id}::uuid RETURNING *
  `;

  await logActivity(context.env, {
    brandId: (before[0] as { brand_id: string }).brand_id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'market_signal.updated',
    entityType: 'market_signal',
    entityId: id,
    beforeState: before[0],
    afterState: updated[0],
  });

  return json({ signal: rowToCamel(updated[0] as Record<string, unknown>) });
};
