import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { encryptToken, decryptToken, maskToken } from '../../../_shared/crypto';
import { probeMetaPublishAccess } from '../../../_shared/meta';
import { logActivity } from '../../../_shared/activity';
import { clampReplyDailyCap, clampReplyHourlyCap } from '../../../_shared/threads-replies';
import { THREADS_SCOPE_FEATURES, probeThreadsPublishAccess, refreshThreadsAccountScopes } from '../../../_shared/threads';
import { getSocialSafetyPolicy, clampSafetyValue } from '../../../_shared/social-safety';
import { threadsOAuthConfigured } from '../../../_shared/threads-oauth';

const SUPPORTED = ['facebook', 'instagram', 'threads'];

function sanitize(row: Record<string, unknown>) {
  const account = rowToCamel(row) as Record<string, unknown>;
  delete account.accessTokenEnc;
  delete account.refreshTokenEnc;
  return account;
}

interface UsageRow { account_id: string; calls_24h: number; failed_24h: number; blocked_24h: number; actions_today: number }

async function loadUsage(env: Env, brandId: string): Promise<Map<string, UsageRow>> {
  const map = new Map<string, UsageRow>();
  try {
    const sql = getSql(env);
    const rows = await sql`
      SELECT account_id,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND blocked_reason IS NULL)::int AS calls_24h,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND blocked_reason IS NULL
                         AND (http_status IS NULL OR http_status >= 400))::int AS failed_24h,
        count(*) FILTER (WHERE created_at > now() - interval '24 hours' AND blocked_reason IS NOT NULL)::int AS blocked_24h,
        count(*) FILTER (WHERE text_hash IS NOT NULL AND http_status BETWEEN 200 AND 299
                         AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'))::int AS actions_today
      FROM social_api_requests
      WHERE brand_id = ${brandId}::uuid AND created_at > now() - interval '24 hours' AND account_id IS NOT NULL
      GROUP BY account_id
    ` as UsageRow[];
    for (const r of rows) map.set(r.account_id, r);
  } catch { /* 057 migration 前沒有這張表 */ }
  return map;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_social_accounts WHERE brand_id = ${brand.id}::uuid
    ORDER BY platform, is_primary DESC, created_at ASC
  `;
  const [usage, policy] = await Promise.all([loadUsage(context.env, brand.id), getSocialSafetyPolicy(context.env)]);

  const accounts = [];
  for (const row of rows as Record<string, unknown>[]) {
    const acc = sanitize(row);
    let tokenMasked: string | null = null;
    if (row.access_token_enc) {
      try {
        tokenMasked = maskToken(await decryptToken(context.env, row.access_token_enc as string));
      } catch {
        tokenMasked = '****(解密失敗)';
      }
    }
    const u = usage.get(row.id as string);
    accounts.push({
      ...acc,
      tokenMasked,
      hasToken: !!row.access_token_enc,
      usage: row.platform === 'threads' ? {
        calls24h: u?.calls_24h ?? 0,
        failed24h: u?.failed_24h ?? 0,
        blocked24h: u?.blocked_24h ?? 0,
        actionsToday: u?.actions_today ?? 0,
        dailyBudget: (row.daily_action_budget as number | null) ?? policy.dailyActionBudget,
      } : undefined,
    });
  }
  return json({
    accounts,
    threads: {
      oauthAvailable: threadsOAuthConfigured(context.env),
      scopeCatalog: THREADS_SCOPE_FEATURES,
      policy,
    },
  });
};

type ExistingRow = {
  id: string; access_token_enc: string | null; token_expires_at: string | null; notes: string | null;
  external_id: string | null; account_name: string | null;
  auto_publish: boolean; auto_reply: boolean; reply_daily_cap: number; reply_hourly_cap: number;
  paused?: boolean; daily_action_budget?: number | null; is_primary?: boolean; connected_via?: string;
  connected_at?: string | null;
};

// upsert 帳號設定。FB / IG 每品牌一個;Threads 帶 accountId 編輯指定帳號、createNew 手動新增帳號,都沒帶則編輯主帳號
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json() as {
    platform?: string;
    accountId?: string;
    createNew?: boolean;
    accountName?: string;
    externalId?: string;
    accessToken?: string;   // 提供則覆寫;undefined 表示不變
    clearToken?: boolean;   // true 則清除 token
    notes?: string;
    autoPublish?: boolean;  // 排程生成後直接發布(threads / facebook / instagram)
    autoReply?: boolean;    // 自動回覆熱門貼文(threads)
    replyDailyCap?: number; // 每日回覆上限
    replyHourlyCap?: number; // 每小時回覆上限(1-20)
    paused?: boolean;       // 帳號停止開關(threads)
    dailyActionBudget?: number | null; // 帳號每日操作預算,null = 沿用組織預設
  };
  if (!body.platform || !SUPPORTED.includes(body.platform)) {
    return error(`platform 必須為 ${SUPPORTED.join(' / ')}`, 400);
  }
  const isThreads = body.platform === 'threads';

  const sql = getSql(context.env);
  let existingRows: ExistingRow[] = [];
  if (isThreads && body.accountId) {
    existingRows = await sql`
      SELECT * FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' AND id = ${body.accountId}::uuid LIMIT 1
    ` as ExistingRow[];
    if (!existingRows.length) return error('找不到這個 Threads 帳號', 404);
  } else if (isThreads && !body.createNew) {
    existingRows = await sql`
      SELECT * FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = 'threads'
      ORDER BY is_primary DESC, created_at ASC LIMIT 1
    ` as ExistingRow[];
  } else if (!isThreads) {
    existingRows = await sql`
      SELECT * FROM brand_social_accounts
      WHERE brand_id = ${brand.id}::uuid AND platform = ${body.platform} LIMIT 1
    ` as ExistingRow[];
  }
  const existing = existingRows[0] ?? null;

  let tokenEnc: string | null = existing?.access_token_enc ?? null;
  let tokenExpiresAt: string | null = existing?.token_expires_at ?? null;
  let notes = body.notes ?? existing?.notes ?? null;
  let externalId = body.externalId ?? existing?.external_id ?? null;
  let accountName = body.accountName ?? existing?.account_name ?? null;
  const newToken = body.accessToken?.trim() || null;
  if (body.clearToken) {
    tokenEnc = null;
    tokenExpiresAt = null;
  } else if (newToken) {
    tokenEnc = await encryptToken(context.env, newToken);
    tokenExpiresAt = null;
  }

  // 有 token 即進入手動發布模式(connected 需通過連線測試);FB/IG 貼新權杖時立刻檢查效期,擋短效 Explorer token
  let status = tokenEnc ? 'manual' : (accountName?.trim() ? 'manual' : 'disconnected');
  let connectedAt: string | null = tokenEnc ? new Date().toISOString() : null;
  if (newToken && !isThreads) {
    const probe = await probeMetaPublishAccess(newToken, body.platform as 'facebook' | 'instagram', externalId);
    tokenExpiresAt = probe.expiresAt;
    status = probe.ok ? 'connected' : 'error';
    notes = probe.detail;
    connectedAt = probe.ok ? new Date().toISOString() : null;
  }
  if (newToken && isThreads) {
    const probe = await probeThreadsPublishAccess(newToken, { env: context.env, accountId: existing?.id ?? null, brandId: brand.id });
    status = probe.ok ? 'connected' : 'error';
    notes = probe.detail;
    connectedAt = probe.ok ? new Date().toISOString() : null;
    if (probe.userId) externalId = probe.userId;
    if (probe.username) accountName = probe.username;
    if (probe.userId) {
      const dup = await sql`
        SELECT id FROM brand_social_accounts
        WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' AND external_id = ${probe.userId}
          AND id <> ${existing?.id ?? '00000000-0000-0000-0000-000000000000'}::uuid
        LIMIT 1
      `;
      if (dup.length) return error(`@${probe.username ?? probe.userId} 已經連在這個品牌的另一列,請直接編輯那一列`, 409);
    }
  }

  const autoPublish = (body.autoPublish ?? existing?.auto_publish ?? false) && !!tokenEnc;
  const autoReply = (body.autoReply ?? existing?.auto_reply ?? false) && !!tokenEnc;
  const replyDailyCap = clampReplyDailyCap(body.replyDailyCap ?? existing?.reply_daily_cap);
  const replyHourlyCap = clampReplyHourlyCap(body.replyHourlyCap ?? existing?.reply_hourly_cap);
  const paused = body.paused ?? existing?.paused ?? false;
  const dailyActionBudget = body.dailyActionBudget === null
    ? null
    : body.dailyActionBudget !== undefined
      ? clampSafetyValue('dailyActionBudget', body.dailyActionBudget, 20)
      : (existing?.daily_action_budget ?? null);

  let saved: Record<string, unknown>;
  if (isThreads) {
    if (existing) {
      const rows = await sql`
        UPDATE brand_social_accounts SET
          account_name = ${accountName}, external_id = ${externalId}, access_token_enc = ${tokenEnc},
          token_expires_at = ${tokenExpiresAt}, status = ${status}, notes = ${notes},
          auto_publish = ${autoPublish}, auto_reply = ${autoReply},
          reply_daily_cap = ${replyDailyCap}, reply_hourly_cap = ${replyHourlyCap},
          connected_at = ${newToken ? connectedAt : (tokenEnc ? existing.connected_at ?? connectedAt : null)},
          connected_via = ${newToken ? 'manual' : (existing.connected_via ?? 'manual')},
          granted_scopes = CASE WHEN ${!!body.clearToken} THEN NULL ELSE granted_scopes END,
          paused = ${paused}, daily_action_budget = ${dailyActionBudget}
        WHERE id = ${existing.id}::uuid
        RETURNING *
      `;
      saved = rows[0] as Record<string, unknown>;
    } else {
      const hasPrimary = await sql`
        SELECT 1 FROM brand_social_accounts WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' AND is_primary LIMIT 1
      `;
      const rows = await sql`
        INSERT INTO brand_social_accounts (
          brand_id, platform, account_name, external_id, access_token_enc, token_expires_at, status, notes,
          auto_publish, auto_reply, reply_daily_cap, reply_hourly_cap, connected_at, connected_via, is_primary,
          paused, daily_action_budget
        ) VALUES (
          ${brand.id}::uuid, 'threads', ${accountName}, ${externalId}, ${tokenEnc}, ${tokenExpiresAt}, ${status}, ${notes},
          ${autoPublish}, ${autoReply}, ${replyDailyCap}, ${replyHourlyCap}, ${connectedAt}, 'manual', ${!hasPrimary.length},
          ${paused}, ${dailyActionBudget}
        )
        RETURNING *
      `;
      saved = rows[0] as Record<string, unknown>;
    }
    if (newToken) {
      await refreshThreadsAccountScopes(context.env, saved.id as string, brand.id, newToken);
    }
  } else {
    const rows = await sql`
      INSERT INTO brand_social_accounts (brand_id, platform, account_name, external_id, access_token_enc, token_expires_at, status, notes, auto_publish, auto_reply, reply_daily_cap, reply_hourly_cap, connected_at)
      VALUES (${brand.id}::uuid, ${body.platform}, ${accountName}, ${externalId},
              ${tokenEnc}, ${tokenExpiresAt}, ${status}, ${notes}, ${autoPublish}, ${autoReply}, ${replyDailyCap}, ${replyHourlyCap}, ${connectedAt})
      ON CONFLICT (brand_id, platform) WHERE platform <> 'threads' DO UPDATE SET
        account_name = EXCLUDED.account_name,
        external_id = EXCLUDED.external_id,
        access_token_enc = EXCLUDED.access_token_enc,
        token_expires_at = EXCLUDED.token_expires_at,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        auto_publish = EXCLUDED.auto_publish,
        auto_reply = EXCLUDED.auto_reply,
        reply_daily_cap = EXCLUDED.reply_daily_cap,
        reply_hourly_cap = EXCLUDED.reply_hourly_cap,
        connected_at = EXCLUDED.connected_at
      RETURNING *
    `;
    saved = rows[0] as Record<string, unknown>;
  }

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'social_account.updated',
    entityType: 'brand_social_account',
    entityId: saved.id as string,
    afterState: {
      platform: body.platform, status,
      ...(isThreads ? { paused, dailyActionBudget, tokenReplaced: !!newToken } : {}),
    },
  });

  const acc = sanitize(saved);
  return json({ account: { ...acc, hasToken: !!tokenEnc } });
};

// 撤銷連線:清掉 token 並停用自動化;remove=true 時整列刪除(只限 Threads 非主帳號)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const url = new URL(context.request.url);
  const accountId = url.searchParams.get('accountId');
  const remove = url.searchParams.get('remove') === '1';
  if (!accountId) return error('需要 accountId', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, platform, account_name, is_primary FROM brand_social_accounts
    WHERE id = ${accountId}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  ` as { id: string; platform: string; account_name: string | null; is_primary: boolean }[];
  if (!rows.length) return error('找不到這個帳號', 404);
  const target = rows[0];

  if (remove) {
    if (target.platform !== 'threads') return error('只有 Threads 帳號可以整列移除', 400);
    if (target.is_primary) return error('主帳號不能直接移除,請先把另一個帳號設為主帳號', 400);
    await sql`DELETE FROM brand_social_accounts WHERE id = ${target.id}::uuid`;
  } else {
    await sql`
      UPDATE brand_social_accounts SET
        access_token_enc = NULL, refresh_token_enc = NULL, token_expires_at = NULL,
        status = 'disconnected', auto_publish = false, auto_reply = false,
        granted_scopes = NULL, scopes_source = NULL, scopes_checked_at = NULL,
        notes = ${`已於 ${new Date().toISOString().slice(0, 16).replace('T', ' ')} 撤銷連線`}
      WHERE id = ${target.id}::uuid
    `;
    if (target.platform === 'threads' && target.is_primary) {
      const next = await sql`
        SELECT id FROM brand_social_accounts
        WHERE brand_id = ${brand.id}::uuid AND platform = 'threads' AND id <> ${target.id}::uuid
          AND access_token_enc IS NOT NULL AND status <> 'error'
        ORDER BY connected_at DESC NULLS LAST LIMIT 1
      ` as { id: string }[];
      if (next.length) {
        await sql`UPDATE brand_social_accounts SET is_primary = false WHERE id = ${target.id}::uuid`;
        await sql`UPDATE brand_social_accounts SET is_primary = true WHERE id = ${next[0].id}::uuid`;
      }
    }
  }

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: remove ? 'social_account.removed' : 'social_account.revoked',
    entityType: 'brand_social_account',
    entityId: target.id,
    beforeState: { platform: target.platform, accountName: target.account_name },
  });
  return json({ ok: true });
};
