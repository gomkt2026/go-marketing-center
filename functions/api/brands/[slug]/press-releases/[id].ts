import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { rowToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    title?: string;
    body?: string;
    embargoOn?: string | null;
  };

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM press_releases WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!existing.length) return error('找不到這則新聞稿', 404);
  const prev = existing[0] as { status: string; title: string; body: string; embargo_on: string | null };
  if (prev.status === 'final') return error('已定稿的新聞稿不能再改正文,請另開新稿', 400);

  const updated = await sql`
    UPDATE press_releases SET
      title = ${body.title?.trim() ?? prev.title},
      body = ${body.body?.trim() ?? prev.body},
      embargo_on = ${body.embargoOn !== undefined ? body.embargoOn : prev.embargo_on},
      updated_by = ${auth.id}::uuid
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  await logActivity(context.env, {
    brandId: brand.id, actorType: 'user', actorUserId: auth.id,
    action: 'press_release.updated', entityType: 'press_release', entityId: id,
  });
  return json({ release: rowToCamel(updated[0] as Record<string, unknown>) });
};
