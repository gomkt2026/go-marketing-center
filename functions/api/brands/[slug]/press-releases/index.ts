import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { rowsToCamel, rowToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM press_releases WHERE brand_id = ${brand.id}::uuid ORDER BY updated_at DESC
  `;
  return json({ releases: rowsToCamel(rows as Record<string, unknown>[]) });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    title?: string;
    body?: string;
    embargoOn?: string;
  };
  if (!body.title?.trim() || !body.body?.trim()) return error('title 與 body 必填', 400);

  const sql = getSql(context.env);
  const inserted = await sql`
    INSERT INTO press_releases (brand_id, title, body, status, embargo_on, created_by, updated_by)
    VALUES (
      ${brand.id}::uuid, ${body.title.trim()}, ${body.body.trim()}, 'draft',
      ${body.embargoOn || null}, ${auth.id}::uuid, ${auth.id}::uuid
    ) RETURNING *
  `;
  const release = rowToCamel(inserted[0] as Record<string, unknown>);
  await logActivity(context.env, {
    brandId: brand.id, actorType: 'user', actorUserId: auth.id,
    action: 'press_release.created', entityType: 'press_release',
    entityId: release.id as string,
  });
  return json({ release }, 201);
};
