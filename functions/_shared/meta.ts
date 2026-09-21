import type { Env } from './env';
import { getSql } from './db';
import { decryptToken } from './crypto';
import { normalizeMultilineText } from './text';

// ============================================================================
// Meta Graph API 發布封裝(Facebook 粉專 / Instagram 商業帳號)
//   FB:純文字 POST /{page-id}/feed;帶圖 POST /{page-id}/photos(url + caption)
//   IG:必須帶圖 → POST /{ig-id}/media 建 container → 輪詢就緒 → /{ig-id}/media_publish
//   注意:image_url 由 Meta 伺服器抓圖,必須是公開絕對網址;IG 只接受 JPEG
// ============================================================================

const GRAPH_API = 'https://graph.facebook.com/v21.0';

export interface MetaAccount {
  accountId: string;      // brand_social_accounts.id
  externalId: string;     // FB Page ID 或 IG 商業帳號 ID
  accessToken: string;    // 解密後的 Page Token
  autoPublish: boolean;
}

/** 取得品牌已連接且可用的 FB/IG 帳號;未設定、缺 token 或缺平台 ID 回傳 null */
export async function getMetaAccount(
  env: Env,
  brandId: string,
  platform: 'facebook' | 'instagram',
): Promise<MetaAccount | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, external_id, access_token_enc, auto_publish, status
    FROM brand_social_accounts
    WHERE brand_id = ${brandId}::uuid AND platform = ${platform}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as {
    id: string; external_id: string | null; access_token_enc: string | null;
    auto_publish: boolean; status: string;
  };
  if (!row.access_token_enc || !row.external_id || row.status === 'error') return null;

  let token: string;
  try {
    token = await decryptToken(env, row.access_token_enc);
  } catch {
    return null;
  }
  return { accountId: row.id, externalId: row.external_id, accessToken: token, autoPublish: row.auto_publish };
}

export interface MetaPublishResult {
  postId: string;
  permalink: string | null;
}

export function isMetaTokenInvalid(message: string): boolean {
  return /Error validating access token|Session has expired|session is invalid|has been invalidated/i.test(message);
}

const SHORT_LIVED_MS = 48 * 60 * 60 * 1000;

function formatTaipei(date: Date): string {
  return date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
}

/** Graph 190 訊息裡的「Session has expired on Wednesday, 16-Sep-26 02:00:00 PDT」 */
export function parseMetaSessionExpiry(message: string): Date | null {
  const m = message.match(/Session has expired on ([A-Za-z]+, \d{1,2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} [A-Z]+)/i);
  if (!m) return null;
  const normalized = m[1].replace(/-(\d{2}) /, '-20$1 ');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function metaTokenInvalidNote(expiredAt?: Date | null): string {
  const when = expiredAt
    ? `資料庫這把權杖已於 ${formatTaipei(expiredAt)}（台北）到期。`
    : '資料庫這把 Facebook／Instagram 權杖已失效。';
  return `${when}Graph API 探索工具裡剛延伸過的是「另一把」字串，後台不會自動替換。請把延伸後的粉絲專頁存取權杖重新貼到 Facebook 與 Instagram、儲存後再測連線。Threads 權杖是另一把，不受影響。`;
}

export const META_TOKEN_INVALID_NOTE = metaTokenInvalidNote(null);

export function metaTokenInvalidNoteFromMessage(message: string): string {
  return metaTokenInvalidNote(parseMetaSessionExpiry(message));
}

const META_SHORT_LIVED_NOTE =
  '這把是短效權杖（Graph API 探索工具剛產生的通常 1–2 小時就到期）。請先到「存取權杖偵錯」按「延伸存取權杖」，把延伸後的那一把重新貼到 Facebook 與 Instagram 再測。只在 Explorer 測通、沒重新貼進後台，晚上發文仍會 190。';

export interface MetaTokenInspection {
  valid: boolean;
  type: string | null;
  expiresAt: Date | null;
  neverExpires: boolean;
  shortLived: boolean;
  appId: string | null;
  errorMessage: string | null;
}

/** 用 debug_token 自查效期；過期權杖會回 190，從訊息抽出到期時間 */
export async function inspectMetaAccessToken(token: string): Promise<MetaTokenInspection> {
  const url = `${GRAPH_API}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    const body = await res.json().catch(() => ({})) as {
      data?: {
        is_valid?: boolean; type?: string; expires_at?: number; app_id?: string;
        error?: { message?: string };
      };
      error?: { message?: string };
    };
    const msg = body.error?.message ?? body.data?.error?.message ?? null;
    if (!res.ok || body.error) {
      return {
        valid: false,
        type: null,
        expiresAt: msg ? parseMetaSessionExpiry(msg) : null,
        neverExpires: false,
        shortLived: false,
        appId: null,
        errorMessage: msg,
      };
    }
    const exp = body.data?.expires_at ?? 0;
    const neverExpires = exp === 0;
    const expiresAt = neverExpires ? null : new Date(exp * 1000);
    const shortLived = !neverExpires && !!expiresAt && (expiresAt.getTime() - Date.now()) < SHORT_LIVED_MS;
    return {
      valid: body.data?.is_valid !== false,
      type: body.data?.type ?? null,
      expiresAt,
      neverExpires,
      shortLived,
      appId: body.data?.app_id ?? null,
      errorMessage: null,
    };
  } catch (e) {
    return {
      valid: false, type: null, expiresAt: null, neverExpires: false, shortLived: false, appId: null,
      errorMessage: e instanceof Error ? e.message : 'debug_token 失敗',
    };
  }
}

function formatGraphApiError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; error_user_msg?: string; code?: number; error_subcode?: number };
    };
    const e = parsed.error;
    if (e) {
      const msg = e.error_user_msg || e.message || body;
      const hint = isMetaTokenInvalid(msg) ? ` ${metaTokenInvalidNoteFromMessage(msg)}` : '';
      return `${status}${e.code != null ? `/${e.code}` : ''}: ${msg}${hint}`;
    }
  } catch { /* 不是 JSON */ }
  return `${status}: ${body.slice(0, 300)}`;
}

async function graphPost(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Graph API 失敗 (${formatGraphApiError(res.status, text)})`);
  }
  return await res.json() as Record<string, unknown>;
}

export interface MetaProbeResult {
  ok: boolean;
  detail: string;
  fetchedId: string | null;
  expiresAt: string | null;
  neverExpires: boolean;
}

/** 確認粉專／IG 權杖還能讀到目標帳號，並拒絕短效 Explorer token（避免測通後幾小時就 190） */
export async function probeMetaPublishAccess(
  token: string,
  platform: 'facebook' | 'instagram',
  externalId: string | null,
): Promise<MetaProbeResult> {
  const inspection = await inspectMetaAccessToken(token);
  const expiresAt = inspection.expiresAt?.toISOString() ?? null;
  if (!inspection.valid) {
    const msg = inspection.errorMessage ?? '';
    return {
      ok: false,
      detail: isMetaTokenInvalid(msg) ? metaTokenInvalidNote(inspection.expiresAt) : `平台回應錯誤:${msg || '權杖無效'}`,
      fetchedId: null,
      expiresAt,
      neverExpires: false,
    };
  }
  if (inspection.shortLived) {
    const until = inspection.expiresAt ? formatTaipei(inspection.expiresAt) : '數小時內';
    return {
      ok: false,
      detail: `${META_SHORT_LIVED_NOTE}目前效期至 ${until}。`,
      fetchedId: null,
      expiresAt,
      neverExpires: false,
    };
  }

  const id = externalId?.trim();
  const url = platform === 'instagram' && id
    ? `${GRAPH_API}/${encodeURIComponent(id)}?fields=id,username&access_token=${encodeURIComponent(token)}`
    : id
      ? `${GRAPH_API}/${encodeURIComponent(id)}?fields=id,name&access_token=${encodeURIComponent(token)}`
      : `${GRAPH_API}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => ({})) as {
      id?: string; name?: string; username?: string; error?: { message?: string };
    };
    if (!res.ok) {
      const msg = data.error?.message ?? res.statusText;
      return {
        ok: false,
        detail: isMetaTokenInvalid(msg) ? metaTokenInvalidNote(parseMetaSessionExpiry(msg)) : `平台回應錯誤:${msg}`,
        fetchedId: null,
        expiresAt,
        neverExpires: inspection.neverExpires,
      };
    }
    const label = data.name ?? data.username ?? data.id;
    if (platform === 'facebook' && !id) {
      return {
        ok: false,
        detail: `權杖有效,但沒有填粉專 Page ID。目前 /me 是「${label}」,請填這個品牌的粉專 ID 再測一次,不要留空。`,
        fetchedId: data.id ?? null,
        expiresAt,
        neverExpires: inspection.neverExpires,
      };
    }
    const life = inspection.neverExpires
      ? '權杖不過期'
      : inspection.expiresAt
        ? `效期至 ${formatTaipei(inspection.expiresAt)}`
        : '效期已確認';
    return { ok: true, detail: `連線成功:${label}（${life}）`, fetchedId: data.id ?? null, expiresAt, neverExpires: inspection.neverExpires };
  } catch (e) {
    return {
      ok: false,
      detail: `連線失敗:${e instanceof Error ? e.message : '未知錯誤'}`,
      fetchedId: null,
      expiresAt,
      neverExpires: inspection.neverExpires,
    };
  }
}

/** 貼文全文 = 內文 + hashtags(FB 建議少量、IG 可多) */
export function composePostMessage(body: string, hashtags: string[] | null | undefined): string {
  const text = normalizeMultilineText(body);
  const tags = (hashtags ?? []).map((h) => `#${h.replace(/^#/, '')}`).join(' ');
  return tags ? `${text}\n\n${tags}` : text;
}

/**
 * 取得可對粉專發文的 Page token。
 * 後台儲存的常是 System User / User token(IG 發文可用,但 FB 粉專發文必須用 Page token),
 * 這裡統一向 Graph API 換取;若儲存的已是 Page token,此呼叫會原樣回傳同一把,結果不變。
 */
export async function resolvePageToken(account: MetaAccount): Promise<string> {
  try {
    const res = await fetch(
      `${GRAPH_API}/${encodeURIComponent(account.externalId)}?fields=access_token&access_token=${encodeURIComponent(account.accessToken)}`,
    );
    if (res.ok) {
      const data = await res.json() as { access_token?: string };
      if (data.access_token) return data.access_token;
    }
  } catch { /* 換不到就用原 token 嘗試 */ }
  return account.accessToken;
}

/** 發布 FB 粉專貼文;imageUrl 需為公開絕對網址 */
export async function publishFacebookPost(
  account: MetaAccount,
  params: { message: string; imageUrl?: string | null },
): Promise<MetaPublishResult> {
  const pageToken = await resolvePageToken(account);
  let postId: string;
  if (params.imageUrl) {
    const data = await graphPost(`${GRAPH_API}/${account.externalId}/photos`, {
      access_token: pageToken,
      url: params.imageUrl,
      caption: params.message,
    });
    postId = String((data.post_id ?? data.id) ?? '');
  } else {
    const data = await graphPost(`${GRAPH_API}/${account.externalId}/feed`, {
      access_token: pageToken,
      message: params.message,
    });
    postId = String(data.id ?? '');
  }
  if (!postId) throw new Error('FB 發布回應缺少貼文 ID');

  // permalink 查詢失敗不影響發布結果
  let permalink: string | null = null;
  try {
    const res = await fetch(`${GRAPH_API}/${encodeURIComponent(postId)}?fields=permalink_url&access_token=${encodeURIComponent(pageToken)}`);
    if (res.ok) {
      const data = await res.json() as { permalink_url?: string };
      permalink = data.permalink_url ?? null;
    }
  } catch { /* 忽略 */ }
  return { postId, permalink };
}

/** 發布 IG Reels;videoUrl 必須是 Meta 抓得到的公開 mp4 */
export async function publishInstagramReel(
  account: MetaAccount,
  params: { caption: string; videoUrl: string },
): Promise<MetaPublishResult> {
  const container = await graphPost(`${GRAPH_API}/${account.externalId}/media`, {
    access_token: account.accessToken,
    media_type: 'REELS',
    video_url: params.videoUrl,
    caption: params.caption,
    share_to_feed: 'true',
  });
  const containerId = String(container.id ?? '');
  if (!containerId) throw new Error('IG Reels container 建立失敗:回應缺少 ID');

  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code&access_token=${encodeURIComponent(account.accessToken)}`);
      if (!res.ok) continue;
      const data = await res.json() as { status_code?: string };
      if (data.status_code === 'FINISHED') break;
      if (data.status_code === 'ERROR') throw new Error('IG Reels container 處理失敗(影片網址無法抓取或規格不符)');
    } catch (e) {
      if (e instanceof Error && e.message.includes('container 處理失敗')) throw e;
    }
  }

  const published = await graphPost(`${GRAPH_API}/${account.externalId}/media_publish`, {
    access_token: account.accessToken,
    creation_id: containerId,
  });
  const mediaId = String(published.id ?? '');
  if (!mediaId) throw new Error('IG Reels 發布回應缺少 media ID');

  let permalink: string | null = null;
  try {
    const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(account.accessToken)}`);
    if (res.ok) {
      const data = await res.json() as { permalink?: string };
      permalink = data.permalink ?? null;
    }
  } catch { /* 忽略 */ }
  return { postId: mediaId, permalink };
}

/** 發布 IG 商業帳號圖文;IG API 不支援純文字,必須帶公開的 JPEG 圖片網址 */
export async function publishInstagramPost(
  account: MetaAccount,
  params: { caption: string; imageUrl: string },
): Promise<MetaPublishResult> {
  const container = await graphPost(`${GRAPH_API}/${account.externalId}/media`, {
    access_token: account.accessToken,
    image_url: params.imageUrl,
    caption: params.caption,
  });
  const containerId = String(container.id ?? '');
  if (!containerId) throw new Error('IG media container 建立失敗:回應缺少 ID');

  // 等待 Meta 抓圖處理完成(最多輪詢 5 次)
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const res = await fetch(`${GRAPH_API}/${containerId}?fields=status_code&access_token=${encodeURIComponent(account.accessToken)}`);
      if (!res.ok) continue;
      const data = await res.json() as { status_code?: string };
      if (data.status_code === 'FINISHED') break;
      if (data.status_code === 'ERROR') throw new Error('IG media container 處理失敗(圖片網址無法抓取或格式不符,IG 僅支援 JPEG)');
    } catch (e) {
      if (e instanceof Error && e.message.includes('container 處理失敗')) throw e;
    }
  }

  const published = await graphPost(`${GRAPH_API}/${account.externalId}/media_publish`, {
    access_token: account.accessToken,
    creation_id: containerId,
  });
  const mediaId = String(published.id ?? '');
  if (!mediaId) throw new Error('IG 發布回應缺少 media ID');

  let permalink: string | null = null;
  try {
    const res = await fetch(`${GRAPH_API}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(account.accessToken)}`);
    if (res.ok) {
      const data = await res.json() as { permalink?: string };
      permalink = data.permalink ?? null;
    }
  } catch { /* 忽略 */ }
  return { postId: mediaId, permalink };
}
