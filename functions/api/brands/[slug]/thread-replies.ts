import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { publishReplyTarget } from '../../../_shared/threads-replies';
import { logActivity } from '../../../_shared/activity';

// ============================================================================
// Threads 熱門貼文回覆佇列
//   GET  ?status=pending|replied|skipped|failed|all  → 列表(預設 pending)
//   POST { id, action: 'approve' | 'skip', replyText? }
//     approve → (可帶編輯後的 replyText)立即發布回覆
//     skip    → 標記略過
// ============================================================================

const LIST_STATUSES = ['pending', 'replied', 'skipped', 'failed'];

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const url = new URL(context.request.url);
  const status = url.searchParams.get('status') ?? 'pending';

  const sql = getSql(context.env);
  const rows = status === 'all'
    ? await sql`
        SELECT * FROM threads_reply_targets
        WHERE brand_id = ${brand.id}::uuid AND status = ANY(${LIST_STATUSES})
        ORDER BY created_at DESC LIMIT 100
      `
    : await sql`
        SELECT * FROM threads_reply_targets
        WHERE brand_id = ${brand.id}::uuid AND status = ${status}
        ORDER BY created_at DESC LIMIT 100
      `;

  // 近 24 小時已發布數(前台顯示今日額度)
  const statRows = await sql`
    SELECT count(*)::int AS replied_24h
    FROM threads_reply_targets
    WHERE brand_id = ${brand.id}::uuid AND status = 'replied' AND replied_at > now() - interval '24 hours'
  `;

  return json({
    targets: rowsToCamel(rows as Record<string, unknown>[]),
    replied24h: (statRows[0] as { replied_24h: number }).replied_24h,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as { id?: string; action?: string; replyText?: string };
  if (!body.id || !body.action || !['approve', 'skip'].includes(body.action)) {
    return error('需要 id 與 action(approve / skip)', 400);
  }

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, status FROM threads_reply_targets
    WHERE id = ${body.id}::uuid AND brand_id = ${brand.id}::uuid
    LIMIT 1
  `;
  if (!rows.length) return error('找不到這則回覆目標', 404);
  const target = rows[0] as { id: string; status: string };
  if (target.status === 'replied') return error('這則已經發布過了', 400);

  if (body.action === 'skip') {
    await sql`
      UPDATE threads_reply_targets
      SET status = 'skipped', reviewed_by_user_id = ${auth.id}::uuid
      WHERE id = ${target.id}::uuid
    `;
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'threads_reply.skipped',
      entityType: 'threads_reply_target',
      entityId: target.id,
    });
    return json({ ok: true, status: 'skipped' });
  }

  // approve:立即發布(可帶編輯後文字)
  const result = await publishReplyTarget(context.env, {
    targetId: target.id,
    reviewedByUserId: auth.id,
    replyTextOverride: body.replyText?.trim() || undefined,
  });
  if (!result.ok) return error(result.error ?? '發布失敗', 500);
  return json({ ok: true, status: 'replied', permalink: result.replyPermalink ?? null });
};
