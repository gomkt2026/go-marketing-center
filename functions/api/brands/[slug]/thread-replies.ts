import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import {
  publishReplyTarget, getReplyQuotaState, replyQuotaIssue, clampReplyHourlyCap, clampReplyDailyCap,
  getLatestReplyScan, diagnoseBrandReplySearch,
} from '../../../_shared/threads-replies';
import { getThreadsAccount } from '../../../_shared/threads';
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

  const quota = await getReplyQuotaState(context.env, brand.id);
  let acc: { auto_reply?: boolean; reply_daily_cap?: number; reply_hourly_cap?: number } = {};
  try {
    const accRows = await sql`
      SELECT auto_reply, reply_daily_cap, reply_hourly_cap
      FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads'
      LIMIT 1
    `;
    acc = (accRows[0] ?? {}) as typeof acc;
  } catch {
    const accRows = await sql`
      SELECT auto_reply, reply_daily_cap
      FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads'
      LIMIT 1
    `;
    acc = (accRows[0] ?? {}) as typeof acc;
  }

  return json({
    targets: rowsToCamel(rows as Record<string, unknown>[]),
    replied1h: quota.replied1h,
    replied24h: quota.replied24h,
    replyHourlyCap: clampReplyHourlyCap(acc.reply_hourly_cap),
    replyDailyCap: clampReplyDailyCap(acc.reply_daily_cap),
    autoReply: !!acc.auto_reply,
    lastScan: await getLatestReplyScan(context.env, brand.id),
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as { id?: string; action?: string; replyText?: string };
  if (body.action === 'scan') {
    const result = await diagnoseBrandReplySearch(context.env, brand.id, brand.slug);
    return json({ ok: result.ok, status: result.ok ? 'ready' : 'blocked', detail: result.detail });
  }
  if (!body.id || !body.action || !['approve', 'skip'].includes(body.action)) {
    return error('需要 id 與 action(approve / skip / scan)', 400);
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

  // approve:立即發布(可帶編輯後文字);小時/日上限與自動回覆共用
  const account = await getThreadsAccount(context.env, brand.id);
  const quota = await getReplyQuotaState(context.env, brand.id);
  const capIssue = replyQuotaIssue({
    replied1h: quota.replied1h,
    replied24h: quota.replied24h,
    hourlyCap: account?.replyHourlyCap ?? 5,
    dailyCap: account?.replyDailyCap ?? 12,
  });
  if (capIssue) return error(capIssue, 429);

  const result = await publishReplyTarget(context.env, {
    targetId: target.id,
    reviewedByUserId: auth.id,
    replyTextOverride: body.replyText?.trim() || undefined,
  });
  if (!result.ok) return error(result.error ?? '發布失敗', 500);
  return json({ ok: true, status: 'replied', permalink: result.replyPermalink ?? null });
};
