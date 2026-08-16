import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import { toPressCoverage } from '../../../../../_shared/press';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    isPrimary?: boolean;
    storyKey?: string;
    summary?: string;
    keyQuotes?: string[];
    claimableFacts?: string[];
    pressReleaseId?: string;
    dismiss?: boolean;
  };

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM press_coverages WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!existing.length) return error('找不到這則報導', 404);
  const prev = existing[0] as Record<string, unknown>;

  if (body.dismiss) {
    const updated = await sql`
      UPDATE press_coverages SET status = 'dismissed' WHERE id = ${id}::uuid RETURNING *
    `;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'press_coverage.dismissed', entityType: 'press_coverage', entityId: id,
    });
    return json({ coverage: toPressCoverage(updated[0] as Record<string, unknown>) });
  }

  const isPrimary = body.isPrimary ?? (prev.is_primary as boolean);
  const status = isPrimary ? 'published' : 'syndicated';
  const updated = await sql`
    UPDATE press_coverages SET
      status = ${status},
      is_primary = ${isPrimary},
      story_key = ${body.storyKey?.trim() || prev.story_key},
      summary = ${body.summary !== undefined ? body.summary : prev.summary},
      key_quotes = ${body.keyQuotes ? JSON.stringify(body.keyQuotes) : JSON.stringify(prev.key_quotes ?? [])},
      claimable_facts = ${body.claimableFacts ? JSON.stringify(body.claimableFacts) : JSON.stringify(prev.claimable_facts ?? [])},
      press_release_id = ${body.pressReleaseId ?? prev.press_release_id}
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  const coverage = toPressCoverage(updated[0] as Record<string, unknown>);
  await logActivity(context.env, {
    brandId: brand.id, actorType: 'user', actorUserId: auth.id,
    action: 'press_coverage.approved', entityType: 'press_coverage', entityId: id,
    afterState: { status, isPrimary },
  });
  return json({ coverage });
};
