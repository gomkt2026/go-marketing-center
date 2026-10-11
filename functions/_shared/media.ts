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

const EMBEDDED_IMAGE = /data:image\/([a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)/i;

/**
 * data URI，或被網站網址接錯的 data URI
 * （https://站台/data:image/jpeg;base64,...）。Meta 無法用這種網址抓圖。
 */
export function isEmbeddedImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^(?:https?:\/\/[^/?#]+\/)?data:image\/[a-z0-9.+-]+;base64,/i.test(url.trim());
}

/** 從 data URI 還原圖片 bytes。不是內嵌圖時回 null。 */
export function decodeEmbeddedImage(url: string | null | undefined): { mime: string; bytes: Uint8Array } | null {
  if (!isEmbeddedImageUrl(url) || !url) return null;
  const match = url.trim().match(EMBEDDED_IMAGE);
  if (!match) return null;
  const subtype = match[1].toLowerCase();
  const mime = subtype === 'jpg' ? 'image/jpeg' : `image/${subtype}`;
  try {
    const binary = atob(match[2].replace(/\s/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.length ? { mime, bytes } : null;
  } catch {
    return null;
  }
}

function extForImageMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

/** 從 /api/media/{key} 或完整 URL 還原 R2 object key */
export function mediaUrlToKey(url: string | null | undefined): string | null {
  if (!url || isEmbeddedImageUrl(url)) return null;
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

/** 活動 EDM。放 events/ 前綴，不受 generated/ 31 天清理。 */
export function buildEventEdmKey(eventId: string, ext = 'jpg'): string {
  return `events/${eventId}/edm/${crypto.randomUUID()}.${ext}`;
}

/** 品牌 DM／簡報。放 brand-docs/ 前綴,不受 generated/ 31 天清理。 */
export function buildBrandDocumentKey(brandSlug: string, ext: string): string {
  return `brand-docs/${brandSlug}/${crypto.randomUUID()}.${ext.replace(/^\./, '')}`;
}

/** 人脈名片原圖。放 network-cards/ 前綴,不受 generated/ 31 天清理。 */
export function buildNetworkCardKey(brandSlug: string, ext = 'jpg'): string {
  return `network-cards/${brandSlug}/${crypto.randomUUID()}.${ext.replace(/^\./, '')}`;
}

/** 人脈 Bot 小咪語音回覆。不受 generated/ 31 天清理。 */
export function buildNetworkVoiceKey(brandSlug: string, ext = 'mp3'): string {
  return `network-voice/${brandSlug}/${crypto.randomUUID()}.${ext.replace(/^\./, '')}`;
}

export async function putMedia(env: Env, key: string, bytes: Uint8Array, contentType = 'image/png'): Promise<string> {
  if (!env.MEDIA) {
    throw new Error('R2 bucket MEDIA 尚未綁定,請先建立 bucket 並在 wrangler.toml 設定 r2_buckets');
  }
  await env.MEDIA.put(key, bytes as unknown as ArrayBuffer, { httpMetadata: { contentType } });
  return `/api/media/${key}`;
}

export const DEFAULT_PUBLIC_BASE = 'https://go-marketing-center.pages.dev';

/**
 * 把站內相對媒體路徑(/api/media/...)轉成公開絕對 URL。
 * Meta / Threads 的 image_url 參數是由對方伺服器抓圖,必須是公開絕對網址。
 * data URI 不能接在站台後面假裝成網址,否則 Graph API 會 9004 / 324。
 */
export function toPublicMediaUrl(env: Env, url: string | null | undefined): string | null {
  if (!url || isEmbeddedImageUrl(url)) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (env.PUBLIC_BASE_URL ?? DEFAULT_PUBLIC_BASE).replace(/\/$/, '');
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/** 把 data URI 寫進素材庫 R2（不受 31 天清理），回傳 /api/media/... */
export async function storeEmbeddedImage(env: Env, url: string, brandSlug = 'shared'): Promise<string | null> {
  const image = decodeEmbeddedImage(url);
  if (!image) return null;
  const key = buildBrandLibraryKey(brandSlug, extForImageMime(image.mime));
  return putMedia(env, key, image.bytes, image.mime);
}

export interface PublishableMedia {
  publicUrl: string | null;
  /** 寫回 file_url 的值。轉存後是 /api/media/... */
  storedPath: string | null;
  rehosted: boolean;
}

/** 發文前把配圖變成 Meta / Threads 抓得到的公開網址。 */
export async function resolvePublishableMedia(
  env: Env,
  url: string | null | undefined,
  brandSlug = 'shared',
): Promise<PublishableMedia> {
  if (!url) return { publicUrl: null, storedPath: null, rehosted: false };
  if (isEmbeddedImageUrl(url)) {
    const storedPath = await storeEmbeddedImage(env, url, brandSlug);
    return { publicUrl: toPublicMediaUrl(env, storedPath), storedPath, rehosted: !!storedPath };
  }
  return { publicUrl: toPublicMediaUrl(env, url), storedPath: url, rehosted: false };
}
