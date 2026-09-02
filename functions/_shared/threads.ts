import type { Env } from './env';
import { getSql } from './db';
import { decryptToken } from './crypto';
import { normalizeMultilineText } from './text';

// ============================================================================
// Threads Graph API 發布封裝
//   流程:建立 media container → 發布 container
//   文件:https://developers.facebook.com/docs/threads/posts
//   需要 token 權限:threads_basic + threads_content_publish
// ============================================================================

const THREADS_API = 'https://graph.threads.net/v1.0';

export interface ThreadsAccount {
  accountId: string;        // brand_social_accounts.id
  threadsUserId: string;    // external_id
  accessToken: string;      // 解密後
  autoPublish: boolean;
  autoReply: boolean;       // 自動回覆熱門貼文開關
  replyDailyCap: number;    // 每日回覆上限
  replyHourlyCap: number;   // 每小時回覆上限(硬頂 20)
  username: string | null;  // 自家帳號名稱(過濾自家貼文用)
}

/** 取得品牌已連接且可用的 Threads 帳號;未設定或缺 token 回傳 null */
export async function getThreadsAccount(env: Env, brandId: string): Promise<ThreadsAccount | null> {
  const sql = getSql(env);
  let rows: Record<string, unknown>[];
  try {
    rows = await sql`
      SELECT id, external_id, access_token_enc, auto_publish, status, account_name,
             auto_reply, reply_daily_cap, reply_hourly_cap
      FROM brand_social_accounts
      WHERE brand_id = ${brandId}::uuid AND platform = 'threads'
      LIMIT 1
    ` as Record<string, unknown>[];
  } catch {
    rows = await sql`
      SELECT id, external_id, access_token_enc, auto_publish, status, account_name,
             auto_reply, reply_daily_cap
      FROM brand_social_accounts
      WHERE brand_id = ${brandId}::uuid AND platform = 'threads'
      LIMIT 1
    ` as Record<string, unknown>[];
  }
  if (!rows.length) return null;
  const row = rows[0] as {
    id: string; external_id: string | null; access_token_enc: string | null;
    auto_publish: boolean; status: string; account_name: string | null;
    auto_reply: boolean; reply_daily_cap: number; reply_hourly_cap?: number;
  };
  if (!row.access_token_enc || row.status === 'error') return null;

  let token: string;
  try {
    token = await decryptToken(env, row.access_token_enc);
  } catch {
    return null;
  }

  // 一律用目前 token 打 /me,避免資料庫裡的 external_id 是 IG/FB 使用者 ID
  // (POST /{錯的 id}/threads 會回 400「API access to this object is restricted」)
  let userId = row.external_id;
  let username = row.account_name;
  try {
    const res = await fetch(`${THREADS_API}/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
    if (res.ok) {
      const data = await res.json() as { id?: string; username?: string };
      if (data.id) {
        userId = data.id;
        if (data.username) username = data.username;
        if (data.id !== row.external_id || (data.username && data.username !== row.account_name)) {
          await sql`
            UPDATE brand_social_accounts
            SET external_id = ${data.id}, account_name = COALESCE(${data.username ?? null}, account_name)
            WHERE id = ${row.id}::uuid
          `;
        }
      }
    }
  } catch { /* 退回資料庫裡的 id */ }
  if (!userId) return null;

  return {
    accountId: row.id, threadsUserId: userId, accessToken: token,
    autoPublish: row.auto_publish, autoReply: row.auto_reply,
    replyDailyCap: Math.max(1, Math.min(50, row.reply_daily_cap ?? 12)),
    replyHourlyCap: Math.max(1, Math.min(20, row.reply_hourly_cap ?? 5)),
    username,
  };
}

function formatThreadsApiError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; error_user_msg?: string; code?: number };
    };
    const e = parsed.error;
    if (e) {
      const msg = e.error_user_msg || e.message || body;
      const accessDenied = e.code === 200 || /API access blocked/i.test(msg);
      const hint = accessDenied
        ? ' Meta 已封鎖此 App 的 Threads 發文 API。請到 developers.facebook.com 完成開發者帳號驗證；確認發文帳號是 App 測試人員或已通過 App Review；重新授權並貼上含 threads_content_publish 的 60 天長效 token。'
        : '';
      return `${status}${e.code != null ? `/${e.code}` : ''}: ${msg}${hint}`;
    }
  } catch { /* 不是 JSON */ }
  return `${status}: ${body.slice(0, 300)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isMediaNotReady(message: string): boolean {
  return /media with id|not (?:yet )?available|not ready|media not found|in progress/i.test(message);
}

/**
 * 等 container 變成 FINISHED 再 publish。
 * 純文字也要等:立刻呼叫 threads_publish 會 400「The media with ID … is not available」。
 */
async function waitForContainerReady(
  accessToken: string,
  containerId: string,
  maxMs = 25000,
): Promise<void> {
  await sleep(2500);
  const started = Date.now();
  let sawInProgress = false;
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(
        `${THREADS_API}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(accessToken)}`,
      );
      if (res.ok) {
        const data = await res.json() as { status?: string; error_message?: string };
        if (data.status === 'FINISHED' || data.status === 'PUBLISHED') return;
        if (data.status === 'ERROR' || data.status === 'EXPIRED') {
          throw new Error(`Threads container ${data.status}${data.error_message ? `: ${data.error_message}` : ''}`);
        }
        if (data.status === 'IN_PROGRESS') sawInProgress = true;
      } else if (!sawInProgress) {
        // 純文字常查不到 status,等過第一段即可發布
        return;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/container (ERROR|EXPIRED)/i.test(msg)) throw e;
      if (!sawInProgress) return;
    }
    await sleep(2000);
  }
}

async function publishContainer(accessToken: string, creationId: string): Promise<{ id: string }> {
  const publishRes = await fetch(`${THREADS_API}/me/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: accessToken, creation_id: creationId }).toString(),
  });
  if (!publishRes.ok) {
    const text = await publishRes.text().catch(() => '');
    throw new Error(`Threads 發布失敗 (${formatThreadsApiError(publishRes.status, text)})`);
  }
  return await publishRes.json() as { id: string };
}

async function createAndPublish(
  accessToken: string,
  params: { text: string; imageUrl?: string | null; videoUrl?: string | null; replyToId?: string },
): Promise<{ id: string }> {
  const container = await createThreadsContainer(accessToken, params);
  const waitMs = params.videoUrl ? 40000 : params.imageUrl ? 30000 : 20000;
  await waitForContainerReady(accessToken, container.id, waitMs);
  try {
    return await publishContainer(accessToken, container.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isMediaNotReady(msg)) throw e;
    await sleep(4000);
    await waitForContainerReady(accessToken, container.id, 12000);
    return await publishContainer(accessToken, container.id);
  }
}

async function createThreadsContainer(
  accessToken: string,
  params: { text: string; imageUrl?: string | null; videoUrl?: string | null; replyToId?: string },
): Promise<{ id: string }> {
  const containerParams = new URLSearchParams({
    access_token: accessToken,
    text: normalizeMultilineText(params.text).slice(0, 500),
  });
  if (params.replyToId) containerParams.set('reply_to_id', params.replyToId);
  if (params.videoUrl) {
    containerParams.set('media_type', 'VIDEO');
    containerParams.set('video_url', params.videoUrl);
  } else if (params.imageUrl) {
    containerParams.set('media_type', 'IMAGE');
    containerParams.set('image_url', params.imageUrl);
  } else {
    containerParams.set('media_type', 'TEXT');
  }

  // 走 /me,不要用可能填錯的 Threads user id
  const createRes = await fetch(`${THREADS_API}/me/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: containerParams.toString(),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Threads container 建立失敗 (${formatThreadsApiError(createRes.status, text)})`);
  }
  return await createRes.json() as { id: string };
}

export function isThreadsAccessBlocked(message: string): boolean {
  return /API access blocked|#200\b|400\/200/i.test(message);
}

export const THREADS_ACCESS_BLOCKED_NOTE =
  'Meta 已封鎖此 App 的 Threads 發文 API（API access blocked）。請到 developers.facebook.com 完成開發者帳號驗證；確認發文帳號是 App 測試人員或已通過 App Review；重新授權並貼上含 threads_content_publish 的 60 天長效 token，再按「測試連線」。修好前系統不會自動重試。';

/** 測試讀取 + 發文權限:建立 TEXT container 但不發布(24 小時後過期) */
export async function probeThreadsPublishAccess(token: string): Promise<{
  ok: boolean; detail: string; userId: string | null;
}> {
  const meRes = await fetch(`${THREADS_API}/me?fields=id,username&access_token=${encodeURIComponent(token)}`);
  const me = await meRes.json().catch(() => ({})) as { id?: string; username?: string; error?: { message?: string } };
  if (!meRes.ok || !me.id) {
    return { ok: false, detail: `Threads /me 失敗:${me.error?.message ?? meRes.statusText}`, userId: null };
  }
  try {
    await createThreadsContainer(token, { text: '（系統連線測試，此則不會發布）' });
    return {
      ok: true,
      detail: `讀取與發文權限都正常(@${me.username ?? me.id})。測試 container 未發布，24 小時後過期。`,
      userId: me.id,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      detail: isThreadsAccessBlocked(msg) ? THREADS_ACCESS_BLOCKED_NOTE : msg,
      userId: me.id,
    };
  }
}

export interface ThreadsPublishResult {
  postId: string;
  permalink: string | null;
}

// ============================================================================
// Keyword Search:搜尋公開熱門貼文(需 token 具備 threads_keyword_search 權限;
// App Review 未過審前只會搜到自己的貼文)
// ============================================================================

export interface ThreadsSearchPost {
  id: string;
  text: string | null;
  username: string | null;
  permalink: string | null;
  timestamp: string | null;
  mediaType: string | null;
  hasReplies: boolean;
  isReply: boolean;
  isQuotePost: boolean;
}

/** 以關鍵字搜尋公開貼文(search_type=TOP 取熱門排序);失敗會 throw */
export async function searchThreadsPosts(
  account: ThreadsAccount,
  keyword: string,
  limit = 25,
): Promise<ThreadsSearchPost[]> {
  const params = new URLSearchParams({
    q: keyword,
    search_mode: 'KEYWORD',
    search_type: 'TOP',
    fields: 'id,text,username,permalink,timestamp,media_type,has_replies,is_reply,is_quote_post',
    limit: String(Math.min(100, limit)),
    access_token: account.accessToken,
  });
  const res = await fetch(`${THREADS_API}/keyword_search?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Threads 關鍵字搜尋失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as {
    data?: {
      id: string; text?: string; username?: string; permalink?: string;
      timestamp?: string; media_type?: string; has_replies?: boolean;
      is_reply?: boolean; is_quote_post?: boolean;
    }[];
  };
  return (data.data ?? []).map((p) => ({
    id: p.id,
    text: p.text ?? null,
    username: p.username ?? null,
    permalink: p.permalink ?? null,
    timestamp: p.timestamp ?? null,
    mediaType: p.media_type ?? null,
    hasReplies: p.has_replies ?? false,
    isReply: p.is_reply ?? false,
    isQuotePost: p.is_quote_post ?? false,
  }));
}

export interface ThreadsSearchDiagnosis {
  ok: boolean;
  keyword: string;
  total: number;
  ownCount: number;
  publicCount: number;
  error?: string;
  detail: string;
}

/**
 * 診斷 keyword search 能不能搜到「別人的」公開文。
 * App Review 未過審時官方只回自己的貼文,自動回覆佇列就會一直是空的。
 */
export async function diagnoseThreadsKeywordSearch(
  account: ThreadsAccount,
  keyword: string,
): Promise<ThreadsSearchDiagnosis> {
  const own = (account.username ?? '').toLowerCase();
  try {
    const posts = await searchThreadsPosts(account, keyword, 25);
    const ownCount = posts.filter((p) => (p.username ?? '').toLowerCase() === own).length;
    const publicCount = posts.length - ownCount;
    let detail: string;
    if (!posts.length) {
      detail = `關鍵字「${keyword}」沒有搜到任何貼文。token 可能缺少 threads_keyword_search,或 App 還在開發模式。`;
    } else if (publicCount === 0) {
      detail = `關鍵字「${keyword}」搜到 ${posts.length} 則,全部是 @${account.username ?? '自己'}。Meta 規定 threads_keyword_search 未過 App Review 前只能搜自己的文,系統會略過自己的文,所以「Threads 互動」會是空的。請到開發者後台送審這個權限,過審後才能搜公開熱門文。`;
    } else {
      detail = `關鍵字「${keyword}」搜到 ${posts.length} 則,其中別人的公開文 ${publicCount} 則,搜尋可用。`;
    }
    return { ok: publicCount > 0, keyword, total: posts.length, ownCount, publicCount, detail };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      ok: false, keyword, total: 0, ownCount: 0, publicCount: 0, error,
      detail: `關鍵字搜尋失敗:${error}。請重新授權並勾選 threads_keyword_search 與 threads_manage_replies。`,
    };
  }
}

// ============================================================================
// 回覆貼文:建立 container 時帶 reply_to_id(需 threads_manage_replies 權限)
// ============================================================================

/** 回覆一則公開貼文(純文字);失敗會 throw */
export async function replyToThreadsPost(
  account: ThreadsAccount,
  params: { text: string; replyToId: string },
): Promise<ThreadsPublishResult> {
  const published = await createAndPublish(account.accessToken, {
    text: params.text, replyToId: params.replyToId,
  });

  let permalink: string | null = null;
  try {
    const linkRes = await fetch(`${THREADS_API}/${published.id}?fields=permalink&access_token=${encodeURIComponent(account.accessToken)}`);
    if (linkRes.ok) {
      const linkData = await linkRes.json() as { permalink?: string };
      permalink = linkData.permalink ?? null;
    }
  } catch { /* 忽略 */ }

  return { postId: published.id, permalink };
}

/** 發布一則 Threads 貼文(純文字、單張圖或單支影片);失敗會 throw */
export async function publishThreadsPost(
  account: ThreadsAccount,
  params: { text: string; imageUrl?: string | null; videoUrl?: string | null },
): Promise<ThreadsPublishResult> {
  let published: { id: string };
  try {
    published = await createAndPublish(account.accessToken, {
      text: params.text, imageUrl: params.imageUrl, videoUrl: params.videoUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const hadMedia = !!(params.imageUrl || params.videoUrl);
    if (hadMedia && (/container 建立失敗|container ERROR|發布失敗|media with id/i.test(msg))) {
      console.warn(`[threads] 帶媒體發布失敗,改發純文字: ${msg.slice(0, 200)}`);
      published = await createAndPublish(account.accessToken, { text: params.text });
    } else {
      throw e;
    }
  }

  // 4. 取 permalink(失敗不影響結果)
  let permalink: string | null = null;
  try {
    const linkRes = await fetch(`${THREADS_API}/${published.id}?fields=permalink&access_token=${encodeURIComponent(account.accessToken)}`);
    if (linkRes.ok) {
      const linkData = await linkRes.json() as { permalink?: string };
      permalink = linkData.permalink ?? null;
    }
  } catch { /* 忽略 */ }

  return { postId: published.id, permalink };
}
