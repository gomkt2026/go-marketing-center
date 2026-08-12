import type { Env } from './env';
import { getSql } from './db';
import { decryptToken, encryptToken } from './crypto';
import { normalizeMultilineText } from './text';

// ============================================================================
// X(Twitter) API v2 發布封裝 — Go 生態系共用帳號
//   文件:https://developer.x.com/en/docs/x-api/tweets/manage-tweets/api-reference/post-tweets
//   認證:OAuth 2.0 User Context(confidential client + PKCE),需要 tweet.write / offline.access / media.write scope
//   帳號範圍:與 FB/IG/Threads 不同,X 帳號綁定在 collaboration_id(見 brand_social_accounts),
//     不綁定單一品牌,因為這是三品牌(Homigo/TaskGo/Washgo)共用的「Go 生態系」帳號
//   Token 效期:access_token 僅 2 小時;refresh_token 每次刷新會輪替(舊的立即失效),
//     必須在刷新後立即覆寫存檔,否則下次會拿失效的 refresh_token 導致整個帳號需要重新走一次授權
// ============================================================================

const X_API = 'https://api.x.com/2';
const X_TOKEN_URL = 'https://api.x.com/2/oauth2/token';
/** X 單則推文字數上限(以字元計,非 Unicode 加權計算的簡化版,足夠保守) */
export const X_TWEET_MAX_CHARS = 280;

export interface XAccount {
  accountId: string;         // brand_social_accounts.id
  collaborationId: string;   // brand_social_accounts.collaboration_id
  accessToken: string;       // 解密後
  refreshToken: string | null;
  autoPublish: boolean;
  externalId: string | null; // X 帳號 user id(選填,主要用於顯示)
}

/** 取得 Go 生態系(或任何 collaboration 範圍)已連接且可用的 X 帳號;未設定或缺 token 回傳 null */
export async function getXAccount(env: Env, collaborationId: string): Promise<XAccount | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, collaboration_id, external_id, access_token_enc, refresh_token_enc, auto_publish, status
    FROM brand_social_accounts
    WHERE collaboration_id = ${collaborationId}::uuid AND platform = 'x'
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as {
    id: string; collaboration_id: string; external_id: string | null;
    access_token_enc: string | null; refresh_token_enc: string | null;
    auto_publish: boolean; status: string;
  };
  if (!row.access_token_enc || row.status === 'error') return null;

  let accessToken: string;
  let refreshToken: string | null = null;
  try {
    accessToken = await decryptToken(env, row.access_token_enc);
    if (row.refresh_token_enc) refreshToken = await decryptToken(env, row.refresh_token_enc);
  } catch {
    return null;
  }

  return {
    accountId: row.id, collaborationId: row.collaboration_id, accessToken, refreshToken,
    autoPublish: row.auto_publish, externalId: row.external_id,
  };
}

/**
 * 用 refresh_token 換一組新的 access_token(+ 輪替後的新 refresh_token),立即寫回加密欄位。
 * X 採 confidential client,需以 X_CLIENT_ID:X_CLIENT_SECRET 做 HTTP Basic 認證。
 * 失敗(通常是 refresh_token 已失效)會把帳號標記 error,提示需要重新走一次 OAuth 授權。
 */
export async function refreshXToken(env: Env, account: XAccount): Promise<string | null> {
  if (!account.refreshToken) return null;
  if (!env.X_CLIENT_ID || !env.X_CLIENT_SECRET) {
    throw new Error('X_CLIENT_ID / X_CLIENT_SECRET 尚未設定,請先執行 wrangler pages secret put');
  }
  const basicAuth = btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`);
  const res = await fetch(X_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
      client_id: env.X_CLIENT_ID,
    }).toString(),
  });

  const sql = getSql(env);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    await sql`
      UPDATE brand_social_accounts
      SET status = 'error', notes = ${'X token 續期失敗,需重新走一次 OAuth 授權: ' + text.slice(0, 200)}, updated_at = now()
      WHERE id = ${account.accountId}::uuid
    `;
    throw new Error(`X token 續期失敗 (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const accessEnc = await encryptToken(env, data.access_token);
  const refreshEnc = data.refresh_token ? await encryptToken(env, data.refresh_token) : null;
  await sql`
    UPDATE brand_social_accounts
    SET access_token_enc = ${accessEnc},
        refresh_token_enc = COALESCE(${refreshEnc}, refresh_token_enc),
        token_expires_at = now() + (${data.expires_in} || ' seconds')::interval,
        status = 'connected', notes = NULL, updated_at = now()
    WHERE id = ${account.accountId}::uuid
  `;
  return data.access_token;
}

export interface XPublishResult {
  tweetId: string;
  permalink: string | null;
}

/**
 * 上傳一張圖片給 X(單次 multipart POST,圖片不需要 chunked upload,影片才需要),
 * 回傳 media_id 供發推文時帶入 media.media_ids。
 * 注意:此端點需要 OAuth2 token 具備 `media.write` scope(舊的 tweet.read/write/offline.access
 * 組合不含這個 scope,若 access token 是在加這個 scope 之前授權的,會回 403,需要重新走一次 OAuth 授權。
 */
export async function uploadImageMedia(accessToken: string, imageUrl: string): Promise<string> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`下載配圖失敗 (${imgRes.status}): ${imageUrl}`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';

  const form = new FormData();
  form.append('media', new Blob([bytes as unknown as ArrayBuffer], { type: contentType }), 'image.jpg');
  form.append('media_category', 'tweet_image');
  form.append('media_type', contentType);

  const res = await fetch(`${X_API}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`X 圖片上傳失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { data: { id: string } };
  return data.data.id;
}

async function postTweet(
  accessToken: string,
  params: { text: string; replyToId?: string; mediaId?: string },
): Promise<{ id: string }> {
  const body: Record<string, unknown> = { text: normalizeMultilineText(params.text).slice(0, X_TWEET_MAX_CHARS) };
  if (params.replyToId) body.reply = { in_reply_to_tweet_id: params.replyToId };
  if (params.mediaId) body.media = { media_ids: [params.mediaId] };

  const res = await fetch(`${X_API}/tweets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`X 發文失敗 (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as { data: { id: string } };
  return { id: data.data.id };
}

/**
 * 發布單則推文,可選配一張圖(imageUrl 為公開絕對網址,會先上傳到 X 換 media_id 再附加)。
 * 圖片上傳失敗不會擋住發文,會 fallback 成純文字並在 console 記錄錯誤。
 * account.externalId 若已知會用來組 permalink。
 */
export async function publishTweet(account: XAccount, params: { text: string; imageUrl?: string | null }): Promise<XPublishResult> {
  let mediaId: string | undefined;
  if (params.imageUrl) {
    try {
      mediaId = await uploadImageMedia(account.accessToken, params.imageUrl);
    } catch (e) {
      console.error('[x] 配圖上傳失敗,改發純文字', e);
    }
  }
  const posted = await postTweet(account.accessToken, { text: params.text, mediaId });
  return {
    tweetId: posted.id,
    permalink: account.externalId ? `https://x.com/${account.externalId}/status/${posted.id}` : null,
  };
}

/**
 * 發布一串 Thread(用 in_reply_to_tweet_id 串接);圖片只附加在第一則(hook)。
 * 任何一則失敗會立刻中止,已發出去的前幾則不會回滾(X 沒有交易性 API),
 * 失敗訊息會包含「已發出到第幾則」方便人工補救。
 */
export async function publishTweetThread(account: XAccount, texts: string[], imageUrl?: string | null): Promise<XPublishResult[]> {
  let firstMediaId: string | undefined;
  if (imageUrl) {
    try {
      firstMediaId = await uploadImageMedia(account.accessToken, imageUrl);
    } catch (e) {
      console.error('[x] 配圖上傳失敗,改發純文字 thread', e);
    }
  }
  const results: XPublishResult[] = [];
  let replyToId: string | undefined;
  for (let i = 0; i < texts.length; i++) {
    try {
      const posted = await postTweet(account.accessToken, { text: texts[i], replyToId, mediaId: i === 0 ? firstMediaId : undefined });
      replyToId = posted.id;
      results.push({
        tweetId: posted.id,
        permalink: account.externalId ? `https://x.com/${account.externalId}/status/${posted.id}` : null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Thread 第 ${i + 1}/${texts.length} 則發布失敗(前面 ${results.length} 則已成功發出): ${msg}`);
    }
  }
  return results;
}

/**
 * 把一篇長文切成多則推文(thread)。優先照換行/句子邊界切,每則盡量塞滿但保留編號空間(如 "1/5 "),
 * 超長單句才會被硬切。單則短文不需要編號時直接回傳單元素陣列。
 */
export function splitIntoTweetThread(body: string, maxChars = X_TWEET_MAX_CHARS): string[] {
  const text = normalizeMultilineText(body).trim();
  if (text.length <= maxChars) return [text];

  // 先照段落/句子邊界切成候選片段,再貪心塞進每則推文
  const segments = text.split(/(?<=[.!?\n])\s+/).filter(Boolean);
  const rawChunks: string[] = [];
  let current = '';
  for (const seg of segments) {
    const candidate = current ? `${current} ${seg}` : seg;
    if (candidate.length > maxChars - 8 && current) {
      rawChunks.push(current);
      current = seg;
    } else {
      current = candidate;
    }
  }
  if (current) rawChunks.push(current);

  // 超長單句(罕見)硬切
  const chunks = rawChunks.flatMap((chunk) => {
    if (chunk.length <= maxChars - 8) return [chunk];
    const pieces: string[] = [];
    for (let i = 0; i < chunk.length; i += maxChars - 8) pieces.push(chunk.slice(i, i + maxChars - 8));
    return pieces;
  });

  const total = chunks.length;
  return chunks.map((chunk, i) => (total > 1 ? `${chunk} (${i + 1}/${total})` : chunk));
}
