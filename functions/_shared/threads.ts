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
  username: string | null;  // 自家帳號名稱(過濾自家貼文用)
}

/** 取得品牌已連接且可用的 Threads 帳號;未設定或缺 token 回傳 null */
export async function getThreadsAccount(env: Env, brandId: string): Promise<ThreadsAccount | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, external_id, access_token_enc, auto_publish, status, account_name,
           auto_reply, reply_daily_cap
    FROM brand_social_accounts
    WHERE brand_id = ${brandId}::uuid AND platform = 'threads'
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as {
    id: string; external_id: string | null; access_token_enc: string | null;
    auto_publish: boolean; status: string; account_name: string | null;
    auto_reply: boolean; reply_daily_cap: number;
  };
  if (!row.access_token_enc || row.status === 'error') return null;

  let token: string;
  try {
    token = await decryptToken(env, row.access_token_enc);
  } catch {
    return null;
  }

  // external_id 未填時,用 token 反查 Threads user id
  let userId = row.external_id;
  if (!userId) {
    try {
      const res = await fetch(`${THREADS_API}/me?fields=id&access_token=${encodeURIComponent(token)}`);
      if (res.ok) {
        const data = await res.json() as { id?: string };
        userId = data.id ?? null;
      }
    } catch { /* 保持 null */ }
  }
  if (!userId) return null;

  return {
    accountId: row.id, threadsUserId: userId, accessToken: token,
    autoPublish: row.auto_publish, autoReply: row.auto_reply,
    replyDailyCap: row.reply_daily_cap ?? 12, username: row.account_name,
  };
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

// ============================================================================
// 回覆貼文:建立 container 時帶 reply_to_id(需 threads_manage_replies 權限)
// ============================================================================

/** 回覆一則公開貼文(純文字);失敗會 throw */
export async function replyToThreadsPost(
  account: ThreadsAccount,
  params: { text: string; replyToId: string },
): Promise<ThreadsPublishResult> {
  const containerParams = new URLSearchParams({
    access_token: account.accessToken,
    media_type: 'TEXT',
    text: normalizeMultilineText(params.text).slice(0, 500),
    reply_to_id: params.replyToId,
  });
  const createRes = await fetch(`${THREADS_API}/${account.threadsUserId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: containerParams.toString(),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Threads 回覆 container 建立失敗 (${createRes.status}): ${text.slice(0, 300)}`);
  }
  const container = await createRes.json() as { id: string };

  const publishRes = await fetch(`${THREADS_API}/${account.threadsUserId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: account.accessToken, creation_id: container.id }).toString(),
  });
  if (!publishRes.ok) {
    const text = await publishRes.text().catch(() => '');
    throw new Error(`Threads 回覆發布失敗 (${publishRes.status}): ${text.slice(0, 300)}`);
  }
  const published = await publishRes.json() as { id: string };

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

/** 發布一則 Threads 貼文(純文字或帶單張圖片);失敗會 throw */
export async function publishThreadsPost(
  account: ThreadsAccount,
  params: { text: string; imageUrl?: string | null },
): Promise<ThreadsPublishResult> {
  // 1. 建立 media container(發布前把字面 \n 修成真換行,保險舊資料)
  const containerParams = new URLSearchParams({
    access_token: account.accessToken,
    text: normalizeMultilineText(params.text).slice(0, 500), // Threads 上限 500 字
  });
  if (params.imageUrl) {
    containerParams.set('media_type', 'IMAGE');
    containerParams.set('image_url', params.imageUrl);
  } else {
    containerParams.set('media_type', 'TEXT');
  }

  const createRes = await fetch(`${THREADS_API}/${account.threadsUserId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: containerParams.toString(),
  });
  if (!createRes.ok) {
    const text = await createRes.text().catch(() => '');
    throw new Error(`Threads container 建立失敗 (${createRes.status}): ${text.slice(0, 300)}`);
  }
  const container = await createRes.json() as { id: string };

  // 2. 帶圖片時官方建議稍等 container 處理完成
  if (params.imageUrl) await new Promise((r) => setTimeout(r, 5000));

  // 3. 發布 container
  const publishRes = await fetch(`${THREADS_API}/${account.threadsUserId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: account.accessToken, creation_id: container.id }).toString(),
  });
  if (!publishRes.ok) {
    const text = await publishRes.text().catch(() => '');
    throw new Error(`Threads 發布失敗 (${publishRes.status}): ${text.slice(0, 300)}`);
  }
  const published = await publishRes.json() as { id: string };

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
