import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';
import { getThreadsAccount } from '../../../_shared/threads';
import {
  getReplyQuotaState, replyQuotaIssue, clampReplyHourlyCap, clampReplyDailyCap,
  getLatestReplyScan, publishReplyTarget,
} from '../../../_shared/threads-replies';
import { processBrandReplyRound } from '../../../_shared/threads-reply-round';
import {
  THREADS_DESK_HOURS_TW, sourceForDeskHour, slotLabel, slotAtToday, hourTWFromIso,
  generateThreadsDeskSlot,
} from '../../../_shared/threads-slots';

const GEN_CATEGORY_LABEL: Record<string, string> = {
  seasonal_trend: '時事跟風',
  emotion: '感情視角',
  weather: '天氣話題',
  entertainment: '娛樂話題',
  sports: '運動話題',
  image_inspired: '圖片靈感',
  love_story: '愛情散文',
  life_gag: '生活哏文',
  daily_pain: '日常痛點',
};

function autoReplyBlockReason(params: {
  hasAccount: boolean;
  canSearchPublic: boolean | null;
  failedRecent: number;
}): string | null {
  if (!params.hasAccount) return '尚未連接可用的 Threads 帳號';
  if (params.canSearchPublic === false) {
    return '關鍵字搜尋還看不到別人的公開文(通常是 threads_keyword_search 未過 App Review)';
  }
  if (params.canSearchPublic == null) return '尚未掃描搜尋權限,請先按「立即掃文」確認';
  if (params.failedRecent > 0) return '近 12 小時有發布失敗,系統暫停自動發布';
  return null;
}

function asMeta(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
  const v = meta[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function isSkipped(meta: Record<string, unknown>): boolean {
  return meta.skipped === true || meta.skipped === 'true';
}

interface DeskAction {
  action?: string;
  contentId?: string;
  jobId?: string;
  hour?: number;
  body?: string;
  replyBody?: string;
  replyId?: string;
  replyText?: string;
  autoReply?: boolean;
  autoPublish?: boolean;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const dayStart = slotAtToday(0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const contentRows = await sql`
    SELECT c.id, c.title, c.status, c.predicted_engagement_score, c.generation_prompt_meta,
           v.id AS version_id, v.body, v.hashtags,
           a.file_url AS image_url,
           pj.id AS job_id, pj.status AS job_status, pj.scheduled_at, pj.published_at, pj.external_post_id,
           lg.detail AS last_log_detail
    FROM contents c
    LEFT JOIN LATERAL (
      SELECT id, body, hashtags FROM content_versions
      WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT file_url FROM content_assets
      WHERE content_version_id = v.id AND asset_type = 'image' LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT id, status, scheduled_at, published_at, external_post_id
      FROM publishing_jobs
      WHERE content_id = c.id AND status != 'cancelled'
      ORDER BY created_at DESC LIMIT 1
    ) pj ON true
    LEFT JOIN LATERAL (
      SELECT detail FROM publishing_logs
      WHERE publishing_job_id = pj.id ORDER BY created_at DESC LIMIT 1
    ) lg ON true
    WHERE c.brand_id = ${brand.id}::uuid
      AND c.target_platform = 'threads'
      AND c.generation_prompt_meta->>'source' IN ('threads_hourly', 'threads_offtopic')
      AND (c.generation_prompt_meta->>'slotAt')::timestamptz >= ${dayStart.toISOString()}::timestamptz
      AND (c.generation_prompt_meta->>'slotAt')::timestamptz < ${dayEnd.toISOString()}::timestamptz
    ORDER BY (c.generation_prompt_meta->>'slotAt')::timestamptz ASC, c.created_at DESC
  `;

  const byHour = new Map<number, Record<string, unknown>>();
  for (const raw of contentRows as Record<string, unknown>[]) {
    const meta = asMeta(raw.generation_prompt_meta);
    const slotAt = metaString(meta, 'slotAt');
    if (!slotAt) continue;
    const hour = hourTWFromIso(slotAt);
    if (!byHour.has(hour)) byHour.set(hour, raw);
  }

  const slots = THREADS_DESK_HOURS_TW.map((hour) => {
    const source = sourceForDeskHour(hour);
    const slotAt = slotAtToday(hour).toISOString();
    const row = byHour.get(hour);
    if (!row) {
      return {
        hour,
        source,
        slotAt,
        label: slotLabel(source, hour),
        categoryLabel: null,
        contentId: null,
        title: null,
        status: null,
        skipped: false,
        body: null,
        replyBody: null,
        hashtags: null,
        imageUrl: null,
        predictedEngagementScore: null,
        jobId: null,
        jobStatus: null,
        scheduledAt: null,
        publishedAt: null,
        externalPostId: null,
        lastLogDetail: null,
      };
    }
    const meta = asMeta(row.generation_prompt_meta);
    const category = metaString(meta, 'category');
    return {
      hour,
      source,
      slotAt: metaString(meta, 'slotAt') ?? slotAt,
      label: slotLabel(source, hour),
      categoryLabel: category ? (GEN_CATEGORY_LABEL[category] ?? category) : null,
      contentId: row.id,
      title: row.title ?? null,
      status: row.status ?? null,
      skipped: isSkipped(meta) || row.status === 'rejected',
      body: row.body ?? null,
      replyBody: metaString(meta, 'replyBody'),
      hashtags: row.hashtags ?? null,
      imageUrl: row.image_url ?? null,
      predictedEngagementScore: row.predicted_engagement_score ?? null,
      jobId: row.job_id ?? null,
      jobStatus: row.job_status ?? null,
      scheduledAt: row.scheduled_at ?? null,
      publishedAt: row.published_at ?? null,
      externalPostId: row.external_post_id ?? null,
      lastLogDetail: row.last_log_detail ?? null,
    };
  });

  const replyRows = await sql`
    SELECT * FROM threads_reply_targets
    WHERE brand_id = ${brand.id}::uuid AND status = 'pending'
    ORDER BY created_at DESC LIMIT 20
  `;

  const quota = await getReplyQuotaState(context.env, brand.id);
  let acc: {
    auto_reply?: boolean; auto_publish?: boolean;
    reply_daily_cap?: number; reply_hourly_cap?: number;
    access_token_enc?: string | null; status?: string; account_name?: string | null;
  } = {};
  try {
    const accRows = await sql`
      SELECT auto_reply, auto_publish, reply_daily_cap, reply_hourly_cap, access_token_enc, status, account_name
      FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads'
      LIMIT 1
    `;
    acc = (accRows[0] ?? {}) as typeof acc;
  } catch {
    const accRows = await sql`
      SELECT auto_reply, auto_publish, reply_daily_cap, access_token_enc, status, account_name
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

  const pendingCount = slots.filter((s) => s.contentId && !s.skipped && (s.status === 'pending_review' || s.status === 'approved')).length;
  const scheduledCount = slots.filter((s) => s.jobStatus === 'scheduled').length;

  return json({
    date: dayStart.toISOString(),
    slots,
    replies: rowsToCamel(replyRows as Record<string, unknown>[]),
    autoPublish: !!acc.auto_publish,
    autoReply: !!acc.auto_reply,
    hasThreadsAccount,
    threadsUsername: acc.account_name ?? null,
    accountStatus: acc.status ?? null,
    replied1h: quota.replied1h,
    replied24h: quota.replied24h,
    replyHourlyCap: clampReplyHourlyCap(acc.reply_hourly_cap),
    replyDailyCap: clampReplyDailyCap(acc.reply_daily_cap),
    canSearchPublic,
    autoReplyReady: hasThreadsAccount && canSearchPublic === true && quota.failedRecent === 0,
    blockReason,
    pendingCount,
    scheduledCount,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as DeskAction;
  const action = body.action;
  if (!action) return error('action is required', 400);

  const sql = getSql(context.env);

  if (action === 'generate_slot') {
    const hour = Number(body.hour);
    if (!THREADS_DESK_HOURS_TW.includes(hour)) {
      return error('hour 必須是 0/6/9/12/18/21', 400);
    }
    const result = await generateThreadsDeskSlot(context.env, slug, hour);
    if (!result.generated.length) {
      return error(result.skipped[0]?.reason ?? '這一檔沒有產出', 409);
    }
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'content.generated',
      entityType: 'content',
      entityId: result.generated[0].contentId,
      afterState: { source: 'threads_desk', hour },
    });
    return json({ ok: true, status: 'generated', contentId: result.generated[0].contentId });
  }

  if (action === 'set_auto_reply') {
    if (typeof body.autoReply !== 'boolean') return error('需要 autoReply: true / false', 400);
    const accRows = await sql`
      SELECT id, access_token_enc FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' LIMIT 1
    `;
    if (!accRows.length || !(accRows[0] as { access_token_enc: string | null }).access_token_enc) {
      return error('請先在社群帳號貼上 Threads token', 400);
    }
    const accountId = (accRows[0] as { id: string }).id;
    await sql`UPDATE brand_social_accounts SET auto_reply = ${body.autoReply} WHERE id = ${accountId}::uuid`;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'social_account.updated', entityType: 'brand_social_account', entityId: accountId,
      afterState: { platform: 'threads', autoReply: body.autoReply },
    });
    return json({
      ok: true,
      status: body.autoReply ? 'auto_reply_on' : 'auto_reply_off',
      detail: body.autoReply
        ? '已開啟自動回覆:掃到的待審稿會在額度內直接發布'
        : '已關閉自動回覆:之後只入庫待審',
      autoReply: body.autoReply,
    });
  }

  if (action === 'set_auto_publish') {
    if (typeof body.autoPublish !== 'boolean') return error('需要 autoPublish: true / false', 400);
    const accRows = await sql`
      SELECT id, access_token_enc FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' LIMIT 1
    `;
    if (!accRows.length || !(accRows[0] as { access_token_enc: string | null }).access_token_enc) {
      return error('請先在社群帳號貼上 Threads token', 400);
    }
    const accountId = (accRows[0] as { id: string }).id;
    await sql`UPDATE brand_social_accounts SET auto_publish = ${body.autoPublish} WHERE id = ${accountId}::uuid`;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'social_account.updated', entityType: 'brand_social_account', entityId: accountId,
      afterState: { platform: 'threads', autoPublish: body.autoPublish },
    });
    return json({
      ok: true,
      status: body.autoPublish ? 'auto_publish_on' : 'auto_publish_off',
      detail: body.autoPublish
        ? '已開啟到期安全網:工作台沒人批准時,到點仍會發出'
        : '已關閉到期安全網:沒批准就不會發',
      autoPublish: body.autoPublish,
    });
  }

  if (action === 'scan') {
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
      queued: result.queued,
      published: result.published,
    });
  }

  if (action === 'reply_approve' || action === 'reply_skip') {
    if (!body.replyId) return error('需要 replyId', 400);
    const rows = await sql`
      SELECT id, status FROM threads_reply_targets
      WHERE id = ${body.replyId}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
    `;
    if (!rows.length) return error('找不到這則回覆目標', 404);
    const target = rows[0] as { id: string; status: string };
    if (target.status === 'replied') return error('這則已經發布過了', 400);

    if (action === 'reply_skip') {
      await sql`
        UPDATE threads_reply_targets
        SET status = 'skipped', reviewed_by_user_id = ${auth.id}::uuid
        WHERE id = ${target.id}::uuid
      `;
      await logActivity(context.env, {
        brandId: brand.id, actorType: 'user', actorUserId: auth.id,
        action: 'threads_reply.skipped', entityType: 'threads_reply_target', entityId: target.id,
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

    const published = await publishReplyTarget(context.env, {
      targetId: target.id,
      reviewedByUserId: auth.id,
      replyTextOverride: body.replyText?.trim() || undefined,
    });
    if (!published.ok) return error(published.error ?? '發布失敗', 500);
    return json({ ok: true, status: 'replied', permalink: published.replyPermalink ?? null });
  }

  if (!body.contentId) return error('需要 contentId', 400);

  const contentRows = await sql`
    SELECT c.id, c.status, c.generation_prompt_meta,
           (SELECT id FROM content_versions WHERE content_id = c.id ORDER BY version_number DESC LIMIT 1) AS version_id
    FROM contents c
    WHERE c.id = ${body.contentId}::uuid AND c.brand_id = ${brand.id}::uuid AND c.target_platform = 'threads'
    LIMIT 1
  `;
  if (!contentRows.length) return error('找不到這篇 Threads 內容', 404);
  const content = contentRows[0] as {
    id: string; status: string; generation_prompt_meta: unknown; version_id: string | null;
  };
  const meta = asMeta(content.generation_prompt_meta);

  if (action === 'save') {
    if (!content.version_id) return error('這篇還沒有文案版本', 400);
    if (typeof body.body === 'string') {
      await sql`
        UPDATE content_versions SET body = ${body.body}
        WHERE id = ${content.version_id}::uuid
      `;
    }
    if (typeof body.replyBody === 'string') {
      const nextMeta = { ...meta, replyBody: body.replyBody.trim() || undefined };
      await sql`
        UPDATE contents
        SET generation_prompt_meta = ${JSON.stringify(nextMeta)}::jsonb, updated_at = now()
        WHERE id = ${content.id}::uuid
      `;
    } else {
      await sql`UPDATE contents SET updated_at = now() WHERE id = ${content.id}::uuid`;
    }
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'content.reviewed', entityType: 'content', entityId: content.id,
      afterState: { source: 'threads_desk', edited: true },
    });
    return json({ ok: true, status: 'saved' });
  }

  if (action === 'skip') {
    const nextMeta = { ...meta, skipped: true };
    await sql`
      UPDATE contents
      SET status = 'rejected', generation_prompt_meta = ${JSON.stringify(nextMeta)}::jsonb, updated_at = now()
      WHERE id = ${content.id}::uuid
    `;
    await sql`
      UPDATE publishing_jobs
      SET status = 'cancelled', updated_at = now()
      WHERE content_id = ${content.id}::uuid AND status IN ('queued', 'scheduled')
    `;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'content.rejected', entityType: 'content', entityId: content.id,
      afterState: { source: 'threads_desk', skipped: true },
    });
    return json({ ok: true, status: 'skipped' });
  }

  if (action === 'cancel') {
    const jobs = await sql`
      SELECT id FROM publishing_jobs
      WHERE content_id = ${content.id}::uuid AND status IN ('queued', 'scheduled')
    `;
    if (!jobs.length) return error('沒有可取消的排程', 404);
    await sql`
      UPDATE publishing_jobs
      SET status = 'cancelled', updated_at = now()
      WHERE content_id = ${content.id}::uuid AND status IN ('queued', 'scheduled')
    `;
    await sql`UPDATE contents SET status = 'pending_review', updated_at = now() WHERE id = ${content.id}::uuid`;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'content.reviewed', entityType: 'content', entityId: content.id,
      afterState: { source: 'threads_desk', cancelled: true },
    });
    return json({ ok: true, status: 'cancelled' });
  }

  if (action === 'retry') {
    const jobId = body.jobId;
    if (!jobId) return error('需要 jobId', 400);
    const jobs = await sql`
      SELECT pj.id FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE pj.id = ${jobId}::uuid AND c.brand_id = ${brand.id}::uuid AND pj.status = 'failed'
      LIMIT 1
    `;
    if (!jobs.length) return error('找不到可重試的失敗排程', 404);
    await sql`
      UPDATE publishing_jobs SET status = 'scheduled', scheduled_at = now(), updated_at = now()
      WHERE id = ${jobId}::uuid
    `;
    await sql`
      INSERT INTO publishing_logs (publishing_job_id, event, detail)
      VALUES (${jobId}::uuid, 'retried', '工作台重新排入發布')
    `;
    await sql`UPDATE contents SET status = 'scheduled', updated_at = now() WHERE id = ${content.id}::uuid`;
    return json({ ok: true, status: 'scheduled' });
  }

  if (action === 'approve' || action === 'publish_now') {
    if (!content.version_id) return error('這篇還沒有文案版本,無法發布', 400);
    if (isSkipped(meta) || content.status === 'rejected') {
      return error('這檔已被跳過,請改產新稿或取消跳過', 400);
    }
    const existing = await sql`
      SELECT id, status FROM publishing_jobs
      WHERE content_id = ${content.id}::uuid AND status IN ('scheduled', 'publishing', 'published')
      LIMIT 1
    `;
    if (existing.length && action === 'approve') {
      return error('這篇已經排入或發布過了', 409);
    }

    if (action === 'publish_now' && existing.length) {
      const job = existing[0] as { id: string; status: string };
      if (job.status === 'published' || job.status === 'publishing') {
        return error('這篇已經在發布或發過了', 409);
      }
      await sql`
        UPDATE publishing_jobs SET scheduled_at = now(), updated_at = now()
        WHERE id = ${job.id}::uuid
      `;
      await sql`UPDATE contents SET status = 'scheduled', updated_at = now() WHERE id = ${content.id}::uuid`;
      return json({ ok: true, status: 'scheduled', jobId: job.id, when: 'now' });
    }

    const slotIso = metaString(meta, 'slotAt');
    const slotAt = slotIso ? new Date(slotIso) : new Date();
    const when = action === 'publish_now' || slotAt.getTime() <= Date.now()
      ? new Date()
      : slotAt;

    const jobRows = await sql`
      INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
      VALUES (${content.id}::uuid, ${content.version_id}::uuid, 'threads', 'scheduled', ${when.toISOString()}::timestamptz)
      RETURNING id
    `;
    await sql`UPDATE contents SET status = 'scheduled', updated_at = now() WHERE id = ${content.id}::uuid`;
    const jobId = (jobRows[0] as { id: string }).id;
    await logActivity(context.env, {
      brandId: brand.id, actorType: 'user', actorUserId: auth.id,
      action: 'content.approved_for_publish', entityType: 'content', entityId: content.id,
      afterState: { jobId, when: when.toISOString(), source: 'threads_desk' },
    });
    return json({ ok: true, status: 'scheduled', jobId, when: when.toISOString() });
  }

  return error('未知的 action', 400);
};
