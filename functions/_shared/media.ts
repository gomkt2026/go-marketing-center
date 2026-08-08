import type { Env } from './env';

// AI 生成圖片存放於 R2(bucket 綁定名稱 MEDIA)
// 物件 key 格式: generated/{brandSlug}/{yyyy-mm}/{uuid}.png
// 由 /api/media/* 讀取;超過一個月的物件由排程 Worker 清除

export function buildMediaKey(brandSlug: string, ext = 'png'): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `generated/${brandSlug}/${ym}/${crypto.randomUUID()}.${ext}`;
}

export async function putMedia(env: Env, key: string, bytes: Uint8Array, contentType = 'image/png'): Promise<string> {
  if (!env.MEDIA) {
    throw new Error('R2 bucket MEDIA 尚未綁定,請先建立 bucket 並在 wrangler.toml 設定 r2_buckets');
  }
  await env.MEDIA.put(key, bytes as unknown as ArrayBuffer, { httpMetadata: { contentType } });
  return `/api/media/${key}`;
}
