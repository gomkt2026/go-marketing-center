import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowToCamel } from '../../_shared/case';
import { logActivity } from '../../_shared/activity';
import { json, error } from '../../_shared/response';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const body = await context.request.json() as {
    brandId?: string;
    ruleType?: string;
    statement?: string;
    conditionNote?: string;
    verification?: string;
  };

  if (!body.brandId || !body.ruleType || !body.statement?.trim()) {
    return error('brandId, ruleType, statement are required', 400);
  }

  const sql = getSql(context.env);
  const inserted = await sql`
    INSERT INTO brand_rules (brand_id, rule_type, statement, condition_note, verification)
    VALUES (
      ${body.brandId}::uuid,
      ${body.ruleType},
      ${body.statement.trim()},
      ${body.conditionNote ?? null},
      ${body.verification ?? 'pending'}
    )
    RETURNING *
  `;

  await logActivity(context.env, {
    brandId: body.brandId,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'brand_rule.created',
    entityType: 'brand_rule',
    entityId: (inserted[0] as { id: string }).id,
    afterState: inserted[0],
  });

  return json({ rule: rowToCamel(inserted[0] as Record<string, unknown>) }, 201);
};
