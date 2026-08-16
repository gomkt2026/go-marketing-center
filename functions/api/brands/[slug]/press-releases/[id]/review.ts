import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { rowToCamel } from '../../../../../_shared/case';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';

const TRANSITIONS: Record<string, Record<string, string>> = {
  submit: { draft: 'pending_review' },
  approve: { pending_review: 'approved' },
  return: { pending_review: 'draft', approved: 'draft' },
  finalize: { approved: 'final' },
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    action?: string;
    note?: string;
  };
  const action = body.action ?? '';
  if (!TRANSITIONS[action]) return error('action 需為 submit / approve / return / finalize', 400);

  const sql = getSql(context.env);
  const existing = await sql`
    SELECT * FROM press_releases WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!existing.length) return error('找不到這則新聞稿', 404);
  const prev = existing[0] as { status: string };
  const next = TRANSITIONS[action][prev.status];
  if (!next) return error(`目前狀態 ${prev.status} 不能執行 ${action}`, 400);

  const updated = await sql`
    UPDATE press_releases SET
      status = ${next},
      review_note = ${body.note?.trim() || null},
      updated_by = ${auth.id}::uuid
    WHERE id = ${id}::uuid
    RETURNING *
  `;
  await logActivity(context.env, {
    brandId: brand.id, actorType: 'user', actorUserId: auth.id,
    action: `press_release.${action}`, entityType: 'press_release', entityId: id,
    beforeState: { status: prev.status },
    afterState: { status: next, note: body.note ?? null },
  });
  return json({ release: rowToCamel(updated[0] as Record<string, unknown>) });
};
