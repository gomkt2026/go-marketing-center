import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT c.*, array_agg(cb.brand_id) AS brand_ids
    FROM campaigns c
    JOIN campaign_brands cb ON cb.campaign_id = c.id
    WHERE cb.brand_id = ${brand.id}::uuid
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `;

  const campaigns = (rows as Record<string, unknown>[]).map((r) => {
    const c = rowsToCamel([r])[0] as Record<string, unknown>;
    return {
      ...c,
      primaryBrandId: c.primaryBrandId ?? brand.id,
      brandIds: r.brand_ids ?? [brand.id],
    };
  });

  return json({ campaigns });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    title?: string;
    objective?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };

  if (!body.title?.trim()) return error('title is required', 400);

  const sql = getSql(context.env);
  const inserted = await sql`
    INSERT INTO campaigns (primary_brand_id, title, objective, status, start_date, end_date)
    VALUES (
      ${brand.id}::uuid,
      ${body.title.trim()},
      ${body.objective ?? null},
      ${body.status ?? 'planning'},
      ${body.startDate ?? null},
      ${body.endDate ?? null}
    )
    RETURNING *
  `;
  const campaign = rowsToCamel(inserted as Record<string, unknown>[])[0] as Record<string, unknown>;
  await sql`INSERT INTO campaign_brands (campaign_id, brand_id) VALUES (${(inserted[0] as { id: string }).id}::uuid, ${brand.id}::uuid)`;

  const { logActivity } = await import('../../../_shared/activity');
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'campaign.created',
    entityType: 'campaign',
    entityId: (inserted[0] as { id: string }).id,
    afterState: campaign,
  });

  return json({ campaign: { ...campaign, brandIds: [brand.id] } }, 201);
};
