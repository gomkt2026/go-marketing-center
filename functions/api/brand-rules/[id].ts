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
  const body = await context.request.json() as {
    statement?: string;
    conditionNote?: string;
    verification?: string;
  };

  const sql = getSql(context.env);
  const before = await sql`SELECT * FROM brand_rules WHERE id = ${id}::uuid LIMIT 1`;
  if (!before.length) return error('Not found', 404);

  const row = before[0] as Record<string, unknown>;
  const updated = await sql`
    UPDATE brand_rules SET
      statement = ${body.statement ?? row.statement},
      condition_note = ${body.conditionNote !== undefined ? body.conditionNote : row.condition_note},
      verification = ${body.verification ?? row.verification}
    WHERE id = ${id}::uuid
    RETURNING *
  `;

  await logActivity(context.env, {
    brandId: row.brand_id as string,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'brand_rule.updated',
    entityType: 'brand_rule',
    entityId: id,
    beforeState: before[0],
    afterState: updated[0],
  });

  return json({ rule: rowToCamel(updated[0] as Record<string, unknown>) });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  const sql = getSql(context.env);
  const before = await sql`SELECT * FROM brand_rules WHERE id = ${id}::uuid LIMIT 1`;
  if (!before.length) return error('Not found', 404);

  await sql`DELETE FROM brand_rules WHERE id = ${id}::uuid`;

  await logActivity(context.env, {
    brandId: (before[0] as { brand_id: string }).brand_id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'brand_rule.deleted',
    entityType: 'brand_rule',
    entityId: id,
    beforeState: before[0],
  });

  return json({ ok: true });
};
