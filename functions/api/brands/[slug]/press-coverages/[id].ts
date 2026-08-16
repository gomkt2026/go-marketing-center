import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import { toPressCoverage } from '../../../../../_shared/press';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    outlet?: string;
    headline?: string;
    articleUrl?: string | null;
    publishedOn?: string | null;
    storyKey?: string;
    summary?: string | null;
    keyQuotes?: string[];
    claimableFacts?: string[];
    isPrimary?: boolean;
    relatedBrandSlugs?: string[];
    status?: string;
    pressReleaseId?: string | null;
  };

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM press_coverages WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!existing.length) return error('找不到這則報導', 404);
  const prev = existing[0] as Record<string, unknown>;

  const status = body.status && ['inbox', 'published', 'syndicated', 'dismissed'].includes(body.status)
    ? body.status
    : (prev.status as string);

  const updated = await sql`
    UPDATE press_coverages SET
      outlet = ${body.outlet?.trim() ?? prev.outlet},
      headline = ${body.headline?.trim() ?? prev.headline},
      article_url = ${body.articleUrl !== undefined ? (body.articleUrl?.trim() || null) : prev.article_url},
      published_on = ${body.publishedOn !== undefined ? body.publishedOn : prev.published_on},
      story_key = ${body.storyKey?.trim() ?? prev.story_key},
      summary = ${body.summary !== undefined ? body.summary : prev.summary},
      key_quotes = ${body.keyQuotes ? JSON.stringify(body.keyQuotes) : JSON.stringify(prev.key_quotes ?? [])},
      claimable_facts = ${body.claimableFacts ? JSON.stringify(body.claimableFacts) : JSON.stringify(prev.claimable_facts ?? [])},
      is_primary = ${body.isPrimary ?? prev.is_primary},
      related_brand_slugs = ${body.relatedBrandSlugs ? JSON.stringify(body.relatedBrandSlugs) : JSON.stringify(prev.related_brand_slugs ?? [])},
      status = ${status},
      press_release_id = ${body.pressReleaseId !== undefined ? body.pressReleaseId : prev.press_release_id}
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  const coverage = toPressCoverage(updated[0] as Record<string, unknown>);
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'press_coverage.updated',
    entityType: 'press_coverage',
    entityId: id,
    beforeState: { status: prev.status },
    afterState: { status: coverage.status },
  });
  return json({ coverage });
};
