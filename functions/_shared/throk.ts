import type { Env } from './env';

// Throk Threads 數據 API(https://developer.throk.ai)
// 用於抓 Threads 台灣區爆紅貼文,讓自動發文做「模仿學習」。
// 積分制付費 API:熱門榜單次 70 積分,故以 R2 快取 6 小時控制消耗。

export interface ThrokHotPost {
  caption: string;
  likeCount: number;
  replyCount: number;
  url: string;
}

const CACHE_KEY = 'cache/throk-hot.json';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchFromThrok(env: Env, size: number): Promise<ThrokHotPost[]> {
  const res = await fetch(
    `https://premium-api.throk.ai/post/hot?size=${size}&language=tw&sort=like:desc`,
    { headers: { Authorization: `Bearer ${env.THROK_API_KEY}` } },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Throk API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json() as {
    content?: { post: { url: string; caption: string; like_count: number; reply_count: number } }[];
  };
  return (data.content ?? [])
    .filter((c) => c.post?.caption)
    .map((c) => ({
      caption: c.post.caption,
      likeCount: c.post.like_count ?? 0,
      replyCount: c.post.reply_count ?? 0,
      url: c.post.url,
    }));
}

/** 取 Threads 台灣區熱門貼文(6 小時快取);未設定 THROK_API_KEY 或失敗時回空陣列 */
export async function getThreadsHotPosts(env: Env, size = 30): Promise<ThrokHotPost[]> {
  if (!env.THROK_API_KEY) return [];

  if (env.MEDIA) {
    try {
      const obj = await env.MEDIA.get(CACHE_KEY);
      if (obj) {
        const cached = await obj.json() as { fetchedAt: number; posts: ThrokHotPost[] };
        if (Date.now() - cached.fetchedAt < CACHE_TTL_MS && cached.posts?.length) return cached.posts;
      }
    } catch { /* 快取壞掉就重抓 */ }
  }

  try {
    const posts = await fetchFromThrok(env, size);
    if (env.MEDIA && posts.length) {
      await env.MEDIA.put(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), posts }), {
        httpMetadata: { contentType: 'application/json' },
      });
    }
    return posts;
  } catch (e) {
    console.error('[throk] 熱門貼文抓取失敗', e);
    return [];
  }
}

/** 把熱門貼文組成「模仿學習」的參考區塊,附進 Threads 生成指令 */
export function buildHotPostReference(posts: ThrokHotPost[], limit = 6): string {
  if (!posts.length) return '';
  const list = posts
    .slice(0, limit)
    .map((p, i) => `${i + 1}. (讚 ${p.likeCount}/回覆 ${p.replyCount}) ${p.caption.replace(/\s+/g, ' ').slice(0, 150)}`)
    .join('\n');
  return [
    'Threads 台灣區現在的爆紅貼文(模仿學習用):',
    list,
    '觀察這些貼文「為什麼會紅」:開頭鉤子怎麼下、行文節奏、怎麼引發留言與轉發。',
    '模仿它們的手法與熱度潛力,可以蹭同樣的話題切角,但文字必須原創、掛上品牌第一線視角,絕不抄襲。',
  ].join('\n');
}
