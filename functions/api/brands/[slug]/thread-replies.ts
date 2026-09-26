import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import {
  publishReplyTarget, getReplyQuotaState, replyQuotaIssue, clampReplyHourlyCap, clampReplyDailyCap,
  getLatestReplyScan, replyTextIssue, generateThreadsReplyDrafts, getThreadsReplyGuide,
} from '../../../_shared/threads-replies';
import { processBrandReplyRound } from '../../../_shared/threads-reply-round';
import { getThreadsAccount } from '../../../_shared/threads';
import { logActivity } from '../../../_shared/activity';
import { toClientError } from '../../../_shared/openai';

// ============================================================================
// Threads 熱門貼文回覆佇列
//   GET  ?status=pending|replied|skipped|failed|all  → 列表 + 自動回覆就緒狀態
//   POST { action: 'scan' }                         → 掃文入庫(自動回覆開則一併發布)
//   POST { action: 'set-auto-reply', autoReply }     → 開關自動回覆
//   POST { id, action: 'approve' | 'skip', replyText? }
// ============================================================================

const LIST_STATUSES = ['pending', 'replied', 'skipped', 'failed'];

function autoReplyBlockReason(params: {
  hasAccount: boolean;
  canSearchPublic: boolean | null;
  failedRecent: number;
}): string | null {
  if (!params.hasAccount) return '尚未連接可用的 Threads 帳號';
  if (params.canSearchPublic === false) {
    return '關鍵字搜尋還看不到別人的公開文(通常是 threads_keyword_search 未過 App Review)';
  }
  if (params.canSearchPublic == null) return '尚未掃描搜尋權限,請先按「立即掃文入庫」確認';
  if (params.failedRecent > 0) return '近 12 小時有發布失敗,系統暫停自動發布';
  return null;
}

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
  let acc: {
    auto_reply?: boolean; reply_daily_cap?: number; reply_hourly_cap?: number;
    access_token_enc?: string | null; status?: string; account_name?: string | null;
  } = {};
  try {
    const accRows = await sql`
      SELECT auto_reply, reply_daily_cap, reply_hourly_cap, access_token_enc, status, account_name
      FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' AND is_primary
      LIMIT 1
    `;
    acc = (accRows[0] ?? {}) as typeof acc;
  } catch {
    const accRows = await sql`
      SELECT auto_reply, reply_daily_cap, access_token_enc, status, account_name
      FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads'
      LIMIT 1
    `;
    acc = (accRows[0] ?? {}) as typeof acc;
  }

  const lastScan = await getLatestReplyScan(context.env, brand.id);
  const hasThreadsAccount = !!acc.access_token_enc && acc.status !== 'error';
  const canSearchPublic = lastScan?.canSearchPublic ?? null;
  const blockReason = autoReplyBlockReason({
    hasAccount: hasThreadsAccount,
    canSearchPublic,
    failedRecent: quota.failedRecent,
  });
  const autoReply = !!acc.auto_reply;
  const autoReplyReady = hasThreadsAccount && canSearchPublic === true && quota.failedRecent === 0;

  const baseHits = lastScan?.hits ?? [];
  const hitIds = baseHits.map((h) => h.id);
  const replyByPost = new Map<string, {
    status: string;
    reply_text: string | null;
    reply_permalink: string | null;
    reply_post_id: string | null;
    replied_at: string | null;
    error_message: string | null;
  }>();
  if (hitIds.length) {
    const replyRows = await sql`
      SELECT target_post_id, status, reply_text, reply_permalink, reply_post_id, replied_at, error_message
      FROM threads_reply_targets
      WHERE brand_id = ${brand.id}::uuid AND target_post_id = ANY(${hitIds})
    `;
    for (const row of replyRows as Array<{
      target_post_id: string; status: string; reply_text: string | null;
      reply_permalink: string | null; reply_post_id: string | null;
      replied_at: string | null; error_message: string | null;
    }>) {
      replyByPost.set(row.target_post_id, row);
    }
  }
  const searchHits = baseHits.map((hit) => {
    const rec = replyByPost.get(hit.id);
    const stored = rec?.reply_text ?? null;
    const usable = stored && rec?.status === 'replied'
      ? stored
      : (stored && !replyTextIssue(stored) ? stored : null);
    return {
      ...hit,
      replyText: usable,
      replyStatus: rec?.status ?? null,
      replyPermalink: rec?.reply_permalink ?? null,
      replyPostId: rec?.reply_post_id ?? null,
      repliedAt: rec?.replied_at ?? null,
      errorMessage: rec?.error_message ?? null,
    };
  });

  return json({
    targets: rowsToCamel(rows as Record<string, unknown>[]),
    replied1h: quota.replied1h,
    replied24h: quota.replied24h,
    replyHourlyCap: clampReplyHourlyCap(acc.reply_hourly_cap),
    replyDailyCap: clampReplyDailyCap(acc.reply_daily_cap),
    autoReply,
    hasThreadsAccount,
    threadsUsername: acc.account_name ?? null,
    canSearchPublic,
    autoReplyReady,
    blockReason,
    lastScan,
    searchHits,
    scanKeywords: lastScan?.keywords ?? [],
    replyGuide: getThreadsReplyGuide(slug),
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    id?: string; action?: string; replyText?: string; autoReply?: boolean;
    postId?: string; permalink?: string; username?: string; text?: string; keyword?: string;
  };

  if (body.action === 'scan') {
    const result = await processBrandReplyRound(context.env, {
      brandId: brand.id,
      brandSlug: brand.slug,
      brandName: brand.name,
      mode: 'manual',
    });
    return json({
      ok: result.ok || result.queued > 0 || result.published > 0,
      status: result.status,
      detail: result.detail,
      canSearchPublic: result.canSearchPublic,
      autoReply: result.autoReply,
      queued: result.queued,
      published: result.published,
      searchHits: result.hits,
      scanKeywords: result.keywords,
    });
  }

  if (body.action === 'set-auto-reply') {
    if (typeof body.autoReply !== 'boolean') return error('需要 autoReply: true / false', 400);
    const sql = getSql(context.env);
    const accRows = await sql`
      SELECT id, access_token_enc FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' AND is_primary
      LIMIT 1
    `;
    if (!accRows.length || !(accRows[0] as { access_token_enc: string | null }).access_token_enc) {
      return error('請先在社群帳號貼上 Threads token', 400);
    }
    const accountId = (accRows[0] as { id: string }).id;
    await sql`
      UPDATE brand_social_accounts
      SET auto_reply = ${body.autoReply}
      WHERE id = ${accountId}::uuid
    `;
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'social_account.updated',
      entityType: 'brand_social_account',
      entityId: accountId,
      afterState: { platform: 'threads', autoReply: body.autoReply },
    });
    return json({
      ok: true,
      status: body.autoReply ? 'auto_reply_on' : 'auto_reply_off',
      detail: body.autoReply
        ? '已開啟自動回覆:之後掃到的待審稿會在額度內直接發布'
        : '已關閉自動回覆:之後只入庫待審,不會自動發',
      autoReply: body.autoReply,
    });
  }

  if (body.action === 'generate-reply') {
    const postText = (body.text ?? '').trim();
    if (!postText) return error('需要原文才能產回覆', 400);
    try {
      const generated = await generateThreadsReplyDrafts(context.env, {
        brandSlug: brand.slug,
        brandName: brand.name,
        postText,
        username: body.username,
        keyword: body.keyword,
      });
      return json({
        ok: true,
        status: 'generated',
        logic: generated.logic,
        drafts: generated.drafts,
      });
    } catch (e) {
      const mapped = toClientError(e, '產回覆');
      return error(mapped.message, mapped.status);
    }
  }

  if (body.action === 'demo-reply') {
    if (!body.postId) return error('需要 postId', 400);
    const replyText = (body.replyText ?? '').trim();
    if (!replyText) return error('請先按「AI 產回覆」或自己填回覆', 400);
    const issue = replyTextIssue(replyText);
    if (issue) return error(issue, 400);

    const account = await getThreadsAccount(context.env, brand.id);
    if (!account) return error('請先在社群帳號貼上 Threads token', 400);
    const quota = await getReplyQuotaState(context.env, brand.id);
    const capIssue = replyQuotaIssue({
      replied1h: quota.replied1h,
      replied24h: quota.replied24h,
      hourlyCap: account.replyHourlyCap,
      dailyCap: account.replyDailyCap,
    });
    if (capIssue) return error(capIssue, 429);

    const sql = getSql(context.env);
    const existing = await sql`
      SELECT id, status FROM threads_reply_targets
      WHERE brand_id = ${brand.id}::uuid AND target_post_id = ${body.postId}
      LIMIT 1
    `;
    if (existing.length) {
      const row = existing[0] as { id: string; status: string };
      if (row.status === 'replied') return error('這則已經回覆過了', 400);
      const result = await publishReplyTarget(context.env, {
        targetId: row.id,
        reviewedByUserId: auth.id,
        replyTextOverride: replyText,
      });
      if (!result.ok) return error(result.error ?? '發布失敗', result.blocked ? 409 : 500);
      return json({
        ok: true,
        status: 'replied',
        permalink: result.replyPermalink ?? null,
        replyText,
        replyPostId: result.replyPostId ?? null,
      });
    }

    const inserted = await sql`
      INSERT INTO threads_reply_targets (
        brand_id, target_post_id, target_permalink, target_username, target_text,
        source_keyword, reply_text, status, reviewed_by_user_id
      ) VALUES (
        ${brand.id}::uuid, ${body.postId}, ${body.permalink ?? null}, ${body.username ?? null},
        ${body.text ?? null}, ${body.keyword || 'demo'}, ${replyText}, 'pending', ${auth.id}::uuid
      )
      RETURNING id
    `;
    const targetId = (inserted[0] as { id: string }).id;
    const result = await publishReplyTarget(context.env, {
      targetId,
      reviewedByUserId: auth.id,
      replyTextOverride: replyText,
    });
    if (!result.ok) return error(result.error ?? '發布失敗', result.blocked ? 409 : 500);
    return json({
      ok: true,
      status: 'replied',
      permalink: result.replyPermalink ?? null,
      replyText,
      replyPostId: result.replyPostId ?? null,
    });
  }

  if (!body.id || !body.action || !['approve', 'skip'].includes(body.action)) {
    return error('需要 id 與 action(approve / skip / scan / set-auto-reply / demo-reply / generate-reply)', 400);
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
  if (!result.ok) return error(result.error ?? '發布失敗', result.blocked ? 409 : 500);
  return json({ ok: true, status: 'replied', permalink: result.replyPermalink ?? null });
};
