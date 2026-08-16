import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { rowToCamel } from '../../../../../_shared/case';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    action?: 'approve' | 'dismiss';
    insight?: string;
  };
  if (body.action !== 'approve' && body.action !== 'dismiss') {
    return error('action 必須為 approve 或 dismiss', 400);
  }

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM learning_records
    WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid
    LIMIT 1
  `;
  if (!existing.length) return error('找不到這則學習建議', 404);

  const status = body.action === 'approve' ? 'approved' : 'dismissed';
  const insight = body.insight?.trim();
  const updated = insight
    ? await sql`
        UPDATE learning_records
        SET status = ${status}, insight = ${insight}
        WHERE id = ${id}::uuid
        RETURNING *
      `
    : await sql`
        UPDATE learning_records
        SET status = ${status}
        WHERE id = ${id}::uuid
        RETURNING *
      `;

  await logActivity(context.env, {
    brandId: brand.id, actorType: 'user', actorUserId: auth.id,
    action: body.action === 'approve' ? 'learning.approved' : 'learning.dismissed',
    entityType: 'learning_record', entityId: id,
    afterState: { status, edited: Boolean(insight) },
  });

  return json({ record: rowToCamel(updated[0] as Record<string, unknown>) });
};
