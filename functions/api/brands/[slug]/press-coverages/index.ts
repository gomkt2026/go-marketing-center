import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { toPressCoverage, slugifyStoryKey } from '../../../../_shared/press';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM press_coverages
    WHERE brand_id = ${brand.id}::uuid
    ORDER BY
      CASE status WHEN 'inbox' THEN 0 WHEN 'published' THEN 1 WHEN 'syndicated' THEN 2 ELSE 3 END,
      published_on DESC NULLS LAST, created_at DESC
  `;
  return json({ coverages: (rows as Record<string, unknown>[]).map(toPressCoverage) });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    outlet?: string;
    headline?: string;
    articleUrl?: string;
    publishedOn?: string;
    storyKey?: string;
    summary?: string;
    keyQuotes?: string[];
    claimableFacts?: string[];
    isPrimary?: boolean;
    relatedBrandSlugs?: string[];
    status?: string;
    pressReleaseId?: string;
  };

  if (!body.outlet?.trim() || !body.headline?.trim()) {
    return error('outlet 與 headline 必填', 400);
  }

  const status = body.status === 'inbox' || body.status === 'syndicated' ? body.status : 'published';
  const storyKey = body.storyKey?.trim() || slugifyStoryKey(`${slug}-${body.headline}`);
  const sql = getSql(context.env);

  try {
    const inserted = await sql`
      INSERT INTO press_coverages (
        brand_id, press_release_id, story_key, outlet, headline, article_url, published_on,
        status, discovery_source, summary, key_quotes, claimable_facts, is_primary, related_brand_slugs
      ) VALUES (
        ${brand.id}::uuid,
        ${body.pressReleaseId ?? null},
        ${storyKey},
        ${body.outlet.trim()},
        ${body.headline.trim()},
        ${body.articleUrl?.trim() || null},
        ${body.publishedOn || null},
        ${status},
        'manual',
        ${body.summary?.trim() || null},
        ${JSON.stringify(body.keyQuotes ?? [])},
        ${JSON.stringify(body.claimableFacts ?? [])},
        ${body.isPrimary ?? true},
        ${JSON.stringify(body.relatedBrandSlugs ?? [])}
      ) RETURNING *
    `;
    const coverage = toPressCoverage(inserted[0] as Record<string, unknown>);
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'press_coverage.created',
      entityType: 'press_coverage',
      entityId: coverage.id,
      afterState: { outlet: coverage.outlet, headline: coverage.headline },
    });
    return json({ coverage }, 201);
  } catch (e) {
    const msg = e instanceof Error ? e.message : '建立失敗';
    if (msg.includes('idx_press_coverages_url')) return error('這個原文連結已經存在', 409);
    return error(msg, 500);
  }
};
