import type { Env } from './env';

// AI 生成圖片存放於 R2(bucket 綁定名稱 MEDIA)
// 物件 key 格式: generated/{brandSlug}/{yyyy-mm}/{uuid}.png
// 由 /api/media/* 讀取;超過一個月的物件由排程 Worker 清除

export function buildMediaKey(brandSlug: string, ext = 'png'): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `generated/${brandSlug}/${ym}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Podcast 逐段音檔的 R2 key。
 * 注意:不放在 generated/ 底下,避免被排程 Worker 的 cleanupOldMedia(31 天)清掉。
 */
export function buildPodcastMediaKey(episodeId: string, segmentOrder: number, ext = 'mp3'): string {
  return `podcast/${episodeId}/${String(segmentOrder).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
}

/** 訪談來賓的原始聲音樣本 key(podcast/ 前綴,不受排程清理) */
export function buildGuestVoiceKey(ext = 'mp3'): string {
  return `podcast/guests/${crypto.randomUUID()}.${ext}`;
}

/**
 * 短影音產物 key。放 videos/ 前綴,不受 generated/ 31 天清理。
 * 例: videos/{jobId}/source.mp4、preview.mp4、final.mp4、edit/pack.json
 */
export function buildVideoJobKey(jobId: string, filename: string): string {
  return `videos/${jobId}/${filename.replace(/^\/+/, '')}`;
}

/** 從 /api/media/{key} 或完整 URL 還原 R2 object key */
export function mediaUrlToKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.split('?')[0];
  const marker = '/api/media/';
  const idx = trimmed.indexOf(marker);
  if (idx >= 0) return decodeURIComponent(trimmed.slice(idx + marker.length));
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\//, '');
  return null;
}

export async function getMediaBytes(env: Env, key: string): Promise<Uint8Array | null> {
  if (!env.MEDIA) return null;
  const obj = await env.MEDIA.get(key);
  if (!obj) return null;
  return new Uint8Array(await obj.arrayBuffer());
}

/**
 * 品牌智慧圖片素材庫的原始上傳圖 key。
 * 注意:放在 brand-assets/ 前綴(不是 generated/),不會被排程 Worker 的 31 天清理機制刪掉。
 */
export function buildBrandLibraryKey(brandSlug: string, ext = 'jpg'): string {
  return `brand-assets/${brandSlug}/library/${crypto.randomUUID()}.${ext}`;
}

export async function putMedia(env: Env, key: string, bytes: Uint8Array, contentType = 'image/png'): Promise<string> {
  if (!env.MEDIA) {
    throw new Error('R2 bucket MEDIA 尚未綁定,請先建立 bucket 並在 wrangler.toml 設定 r2_buckets');
  }
  await env.MEDIA.put(key, bytes as unknown as ArrayBuffer, { httpMetadata: { contentType } });
  return `/api/media/${key}`;
}

const DEFAULT_PUBLIC_BASE = 'https://go-marketing-center.pages.dev';

/**
 * 把站內相對媒體路徑(/api/media/...)轉成公開絕對 URL。
 * Meta / Threads 的 image_url 參數是由對方伺服器抓圖,必須是公開絕對網址。
 */
export function toPublicMediaUrl(env: Env, url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE).replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}
