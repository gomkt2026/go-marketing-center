import type { Env } from './env';
import { getSql } from './db';
import { ensurePostingOpsTables } from './posting-slots';

const LINE_API = 'https://api.line.me/v2/bot';

export function lineOpsConfigured(env: Env): boolean {
  return Boolean(env.LINE_OPS_CHANNEL_SECRET && env.LINE_OPS_CHANNEL_ACCESS_TOKEN);
}

function requireOpsToken(env: Env): string {
  if (!env.LINE_OPS_CHANNEL_ACCESS_TOKEN) throw new Error('LINE_OPS_CHANNEL_ACCESS_TOKEN 尚未設定');
  return env.LINE_OPS_CHANNEL_ACCESS_TOKEN;
}

async function linePost(env: Env, path: string, body: unknown): Promise<void> {
  const res = await fetch(`${LINE_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${requireOpsToken(env)}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LINE API ${path} 失敗 (${res.status}): ${text.slice(0, 200)}`);
  }
}

export async function replyOps(env: Env, replyToken: string, text: string): Promise<void> {
  await linePost(env, '/message/reply', { replyToken, messages: [{ type: 'text', text }] });
}

export async function pushOps(env: Env, to: string, text: string): Promise<boolean> {
  if (!lineOpsConfigured(env)) return false;
  try {
    await linePost(env, '/message/push', { to, messages: [{ type: 'text', text }] });
    return true;
  } catch (e) {
    console.error('[line-ops] push 失敗', e);
    return false;
  }
}

async function lineDisplayName(env: Env, lineUserId: string): Promise<string | null> {
  try {
    const res = await fetch(`${LINE_API}/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${requireOpsToken(env)}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { displayName?: string };
    return data.displayName ?? null;
  } catch {
    return null;
  }
}

function maskLineId(id: string): string {
  if (id.length <= 8) return '****';
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

export async function getBindingForUser(env: Env, userId: string) {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT line_user_id, display_name, notify_review, notify_failed
    FROM user_line_bindings WHERE user_id = ${userId}::uuid LIMIT 1
  `;
  const row = rows[0] as { line_user_id: string; display_name: string | null; notify_review: boolean; notify_failed: boolean } | undefined;
  return {
    bound: !!row,
    lineUserIdMasked: row ? maskLineId(row.line_user_id) : null,
    displayName: row?.display_name ?? null,
    notifyReview: row?.notify_review ?? true,
    notifyFailed: row?.notify_failed ?? true,
    configured: lineOpsConfigured(env),
    addFriendUrl: env.LINE_OPS_ADD_FRIEND_URL ?? 'https://line.me/R/ti/p/@706hmbhp',
  };
}

export async function createBindCode(env: Env, userId: string): Promise<{ code: string; expiresAt: string }> {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await sql`DELETE FROM line_bind_codes WHERE user_id = ${userId}::uuid OR expires_at < now()`;
  await sql`
    INSERT INTO line_bind_codes (code, user_id, expires_at)
    VALUES (${code}, ${userId}::uuid, ${expires.toISOString()}::timestamptz)
  `;
  return { code, expiresAt: expires.toISOString() };
}

export async function updateBindingPrefs(
  env: Env,
  userId: string,
  body: { notifyReview?: boolean; notifyFailed?: boolean; unbind?: boolean },
) {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  if (body.unbind) {
    await sql`DELETE FROM user_line_bindings WHERE user_id = ${userId}::uuid`;
    return getBindingForUser(env, userId);
  }
  await sql`
    UPDATE user_line_bindings
    SET notify_review = coalesce(${body.notifyReview ?? null}, notify_review),
        notify_failed = coalesce(${body.notifyFailed ?? null}, notify_failed),
        updated_at = now()
    WHERE user_id = ${userId}::uuid
  `;
  return getBindingForUser(env, userId);
}

async function bindLineUser(env: Env, lineUserId: string, code: string): Promise<string> {
  await ensurePostingOpsTables(env);
  const sql = getSql(env);
  const rows = await sql`
    SELECT user_id FROM line_bind_codes
    WHERE code = ${code} AND expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) return '綁定碼無效或已過期，請回設定頁重新產生。';
  const userId = (rows[0] as { user_id: string }).user_id;
  const name = await lineDisplayName(env, lineUserId);
  await sql`DELETE FROM user_line_bindings WHERE user_id = ${userId}::uuid OR line_user_id = ${lineUserId}`;
  await sql`
    INSERT INTO user_line_bindings (user_id, line_user_id, display_name)
    VALUES (${userId}::uuid, ${lineUserId}, ${name})
  `;
  await sql`DELETE FROM line_bind_codes WHERE user_id = ${userId}::uuid`;
  return `已綁定 GO 行銷中心。之後可傳「成效」「失敗」「待審」，或「Homigo成效」。`;
}

async function brandsForLineUser(env: Env, lineUserId: string): Promise<Array<{ id: string; slug: string; name: string }>> {
  const sql = getSql(env);
  const userRows = await sql`
    SELECT u.id, u.role
    FROM user_line_bindings b
    JOIN users u ON u.id = b.user_id
    WHERE b.line_user_id = ${lineUserId} AND u.is_active = true
    LIMIT 1
  `;
  if (!userRows.length) return [];
  const user = userRows[0] as { id: string; role: string };
  if (user.role === 'super_admin') {
    return await sql`SELECT id, slug, name FROM brands WHERE is_active = true AND slug IN ('homigo', 'taskgo', 'washgo') ORDER BY slug` as Array<{ id: string; slug: string; name: string }>;
  }
  return await sql`
    SELECT br.id, br.slug, br.name
    FROM brand_members bm
    JOIN brands br ON br.id = bm.brand_id
    WHERE bm.user_id = ${user.id}::uuid AND br.is_active = true
    ORDER BY br.slug
  ` as Array<{ id: string; slug: string; name: string }>;
}

async function performanceText(env: Env, brands: Array<{ id: string; slug: string; name: string }>): Promise<string> {
  const sql = getSql(env);
  const lines: string[] = ['近 7 天行銷成效'];
  for (const brand of brands) {
    const rows = await sql`
      SELECT
        count(*) FILTER (WHERE pj.status = 'published')::int AS published,
        count(*) FILTER (WHERE pj.status = 'failed')::int AS failed,
        coalesce(sum(pr.impressions), 0)::int AS impressions,
        coalesce(sum(CASE WHEN (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::int ELSE 0 END), 0)::int AS likes
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
      WHERE c.brand_id = ${brand.id}::uuid
        AND coalesce(pj.published_at, pj.updated_at) >= now() - interval '7 days'
    `;
    const pending = await sql`
      SELECT count(*)::int AS n FROM contents
      WHERE brand_id = ${brand.id}::uuid AND status = 'pending_review'
    `;
    const r = rows[0] as { published: number; failed: number; impressions: number; likes: number };
    const n = (pending[0] as { n: number }).n;
    lines.push(`${brand.name}：發 ${r.published} / 失敗 ${r.failed}，曝光 ${Number(r.impressions).toLocaleString()}，讚 ${r.likes}，待審 ${n}`);
  }
  return lines.join('\n');
}

async function failedText(env: Env, brands: Array<{ id: string; slug: string; name: string }>): Promise<string> {
  const sql = getSql(env);
  const lines: string[] = ['近 7 天發文失敗'];
  for (const brand of brands) {
    const rows = await sql`
      SELECT c.title, pj.platform
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE c.brand_id = ${brand.id}::uuid AND pj.status = 'failed'
        AND pj.updated_at >= now() - interval '7 days'
      ORDER BY pj.updated_at DESC LIMIT 5
    `;
    if (!rows.length) {
      lines.push(`${brand.name}：沒有失敗`);
      continue;
    }
    lines.push(`${brand.name}：`);
    for (const row of rows as { title: string | null; platform: string }[]) {
      lines.push(`- ${row.platform} ${row.title ?? '(無標題)'}`);
    }
  }
  return lines.join('\n');
}

async function pendingText(env: Env, brands: Array<{ id: string; slug: string; name: string }>): Promise<string> {
  const sql = getSql(env);
  const lines: string[] = ['待審閱內容'];
  for (const brand of brands) {
    const rows = await sql`
      SELECT title, target_platform FROM contents
      WHERE brand_id = ${brand.id}::uuid AND status = 'pending_review'
      ORDER BY updated_at DESC LIMIT 5
    `;
    lines.push(`${brand.name}：${rows.length} 則`);
    for (const row of rows as { title: string | null; target_platform: string | null }[]) {
      lines.push(`- ${row.target_platform ?? ''} ${row.title ?? '(無標題)'}`);
    }
  }
  return lines.join('\n');
}

const HELP = `可用指令：
成效／KPI
Homigo成效、TaskGo成效、Washgo成效
失敗
待審
綁定 123456`;

export async function handleLineOpsEvents(
  env: Env,
  body: { events?: Array<{ type?: string; replyToken?: string; source?: { userId?: string }; message?: { type?: string; text?: string } }> },
): Promise<void> {
  if (!lineOpsConfigured(env)) return;
  await ensurePostingOpsTables(env);
  for (const event of body.events ?? []) {
    const replyToken = event.replyToken;
    const lineUserId = event.source?.userId;
    if (!replyToken || !lineUserId) continue;
    if (event.type === 'follow') {
      await replyOps(env, replyToken, '已加入 GO 行銷中心。請到設定頁產生 6 碼，回傳「綁定 123456」。');
      continue;
    }
    if (event.type !== 'message' || event.message?.type !== 'text' || !event.message.text) continue;
    const text = event.message.text.trim();
    try {
      const bind = text.match(/^綁定\s*(\d{6})$/);
      if (bind) {
        await replyOps(env, replyToken, await bindLineUser(env, lineUserId, bind[1]));
        continue;
      }
      const brands = await brandsForLineUser(env, lineUserId);
      if (!brands.length) {
        await replyOps(env, replyToken, '這個 Line 還沒綁定管理者帳號。請到設定 → Line 通知產生綁定碼。');
        continue;
      }
      const slugHit = brands.find((b) => text.toLowerCase().includes(b.slug) || text.includes(b.name));
      const scoped = slugHit ? [slugHit] : brands;
      if (/失敗/.test(text)) {
        await replyOps(env, replyToken, await failedText(env, scoped));
      } else if (/待審/.test(text)) {
        await replyOps(env, replyToken, await pendingText(env, scoped));
      } else if (/成效|kpi|曝光/i.test(text)) {
        await replyOps(env, replyToken, await performanceText(env, scoped));
      } else {
        await replyOps(env, replyToken, HELP);
      }
    } catch (e) {
      console.error('[line-ops] 處理訊息失敗', e);
      await replyOps(env, replyToken, '查詢暫時失敗，請稍後再試。').catch(() => undefined);
    }
  }
}

async function recipientsForBrand(
  env: Env,
  brandId: string,
  flag: 'notify_review' | 'notify_failed',
): Promise<string[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT b.line_user_id, u.role, b.notify_review, b.notify_failed
    FROM user_line_bindings b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN brand_members bm ON bm.user_id = u.id AND bm.brand_id = ${brandId}::uuid
    WHERE u.is_active = true
      AND (u.role = 'super_admin' OR bm.brand_id IS NOT NULL)
  `;
  return (rows as { line_user_id: string; notify_review: boolean; notify_failed: boolean }[])
    .filter((r) => (flag === 'notify_review' ? r.notify_review : r.notify_failed))
    .map((r) => r.line_user_id);
}

export async function notifyPublishFailed(
  env: Env,
  params: { brandId: string | null; brandSlug: string | null; platform: string; title?: string | null; error: string },
): Promise<void> {
  if (!lineOpsConfigured(env) || !params.brandId) return;
  try {
    await ensurePostingOpsTables(env);
    const targets = await recipientsForBrand(env, params.brandId, 'notify_failed');
    if (!targets.length) return;
    const text = `${params.brandSlug ?? '品牌'} ${params.platform} 發文失敗\n${params.title ?? ''}\n${params.error.slice(0, 180)}`;
    await Promise.all(targets.map((to) => pushOps(env, to, text)));
  } catch (e) {
    console.error('[line-ops] 失敗通知出錯', e);
  }
}

export async function notifyPendingReviewDigest(env: Env): Promise<void> {
  if (!lineOpsConfigured(env)) return;
  try {
    await ensurePostingOpsTables(env);
    const sql = getSql(env);
    const rows = await sql`
      SELECT b.id, b.slug, b.name, count(c.id)::int AS pending
      FROM brands b
      LEFT JOIN contents c ON c.brand_id = b.id AND c.status = 'pending_review'
      WHERE b.slug IN ('homigo', 'taskgo', 'washgo')
      GROUP BY b.id, b.slug, b.name
    `;
    for (const row of rows as { id: string; slug: string; name: string; pending: number }[]) {
      const prevRows = await sql`SELECT pending_count FROM line_review_digests WHERE brand_id = ${row.id}::uuid`;
      const prev = (prevRows[0] as { pending_count: number } | undefined)?.pending_count ?? 0;
      await sql`
        INSERT INTO line_review_digests (brand_id, pending_count, last_notified_at)
        VALUES (${row.id}::uuid, ${row.pending}, now())
        ON CONFLICT (brand_id) DO UPDATE SET pending_count = ${row.pending}, last_notified_at = now()
      `;
      if (row.pending <= 0 || row.pending <= prev) continue;
      const targets = await recipientsForBrand(env, row.id, 'notify_review');
      const text = `${row.name} 有 ${row.pending} 則內容待審閱（比上次多 ${row.pending - prev}）。回「待審」可看標題。`;
      await Promise.all(targets.map((to) => pushOps(env, to, text)));
    }
  } catch (e) {
    console.error('[line-ops] 待審匯總失敗', e);
  }
}
