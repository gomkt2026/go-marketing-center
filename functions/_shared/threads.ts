import type { Env } from './env';
import { getSql } from './db';
import { decryptToken } from './crypto';

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
}

/** 取得品牌已連接且可用的 Threads 帳號;未設定或缺 token 回傳 null */
export async function getThreadsAccount(env: Env, brandId: string): Promise<ThreadsAccount | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT id, external_id, access_token_enc, auto_publish, status
    FROM brand_social_accounts
    WHERE brand_id = ${brandId}::uuid AND platform = 'threads'
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as { id: string; external_id: string | null; access_token_enc: string | null; auto_publish: boolean; status: string };
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

  return { accountId: row.id, threadsUserId: userId, accessToken: token, autoPublish: row.auto_publish };
}

export interface ThreadsPublishResult {
  postId: string;
  permalink: string | null;
}

/** 發布一則 Threads 貼文(純文字或帶單張圖片);失敗會 throw */
export async function publishThreadsPost(
  account: ThreadsAccount,
  params: { text: string; imageUrl?: string | null },
): Promise<ThreadsPublishResult> {
  // 1. 建立 media container
  const containerParams = new URLSearchParams({
    access_token: account.accessToken,
    text: params.text.slice(0, 500), // Threads 上限 500 字
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
