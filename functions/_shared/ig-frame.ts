import { loadPhoton, type PhotonApi, type PhotonImage } from './photon-wasm';

// ============================================================================
// 把素材庫橫式系統截圖包成 IG Feed 可發的 4:5 JPEG
//   Meta IG 只收約 4:5–1.91:1 的 JPEG;橫式 PNG 後台會直接 36003 拒收。
//   這是「系統畫面海報」生成失敗時的後備:品牌色簡報框 + 原圖,不要當主路徑。
// ============================================================================

const IG_W = 1080;
const IG_H = 1350;
const PAD_X = 56;
const PAD_Y = 88;

const BRAND_BG: Record<string, [number, number, number]> = {
  washgo: [0x1d, 0x4f, 0x8c],
  homigo: [0xf5, 0xf1, 0xea],
  taskgo: [0x0b, 0x2d, 0x5c],
};

function fillCanvas(
  PhotonImage: PhotonApi['PhotonImage'],
  w: number,
  h: number,
  rgb: [number, number, number],
): PhotonImage {
  const pixels = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    pixels[o] = rgb[0];
    pixels[o + 1] = rgb[1];
    pixels[o + 2] = rgb[2];
    pixels[o + 3] = 255;
  }
  return new PhotonImage(pixels, w, h);
}

function aspect(w: number, h: number): number {
  return w / Math.max(h, 1);
}

/**
 * 系統截圖 → IG 可用 JPEG。
 * 接近 4:5 只轉 JPEG;橫式報表則置中放進品牌色 4:5 簡報框。
 */
export async function frameScreenshotForIg(imageBytes: Uint8Array, brandSlug: string): Promise<Uint8Array> {
  const { PhotonImage, SamplingFilter, resize, watermark } = await loadPhoton();
  const shot = PhotonImage.new_from_byteslice(imageBytes);
  let canvas: PhotonImage | null = null;
  let card: PhotonImage | null = null;
  let resized: PhotonImage | null = null;
  try {
    const sw = shot.get_width();
    const sh = shot.get_height();
    const ratio = aspect(sw, sh);
    if (ratio >= 0.8 && ratio <= 1.05) {
      return shot.get_bytes_jpeg(90);
    }

    const bg = BRAND_BG[brandSlug] ?? BRAND_BG.washgo;
    canvas = fillCanvas(PhotonImage, IG_W, IG_H, bg);

    const innerW = IG_W - PAD_X * 2;
    const innerH = IG_H - PAD_Y * 2;
    const scale = Math.min(innerW / sw, innerH / sh);
    const tw = Math.max(1, Math.round(sw * scale));
    const th = Math.max(1, Math.round(sh * scale));
    resized = resize(shot, tw, th, SamplingFilter.Lanczos3);

    // 白卡比截圖多 16px,像簡報裡的畫面框
    const cardPad = 16;
    const cardW = tw + cardPad * 2;
    const cardH = th + cardPad * 2;
    card = fillCanvas(PhotonImage, cardW, cardH, [255, 255, 255]);
    watermark(card, resized, BigInt(cardPad), BigInt(cardPad));

    const x = Math.round((IG_W - cardW) / 2);
    const y = Math.round((IG_H - cardH) / 2);
    watermark(canvas, card, BigInt(x), BigInt(y));
    return canvas.get_bytes_jpeg(90);
  } finally {
    shot.free();
    canvas?.free();
    card?.free();
    resized?.free();
  }
}

/** 海報留白底色,對得上後製主標,不是 IG 簡報框那組深色底 */
const POSTER_BG: Record<string, [number, number, number]> = {
  homigo: [0xf5, 0xf1, 0xea],
  washgo: [0xe6, 0xf2, 0xff],
  taskgo: [0x0b, 0x2d, 0x5c],
};

/** 從放大後的圖裁出置中區塊。Photon 這層沒有穩定的 crop,改切 RGBA。 */
function cropCenter(
  PhotonImage: PhotonApi['PhotonImage'],
  img: PhotonImage,
  targetW: number,
  targetH: number,
): PhotonImage {
  const sw = img.get_width();
  const sh = img.get_height();
  const tw = Math.min(targetW, sw);
  const th = Math.min(targetH, sh);
  const x0 = Math.max(0, Math.floor((sw - tw) / 2));
  const y0 = Math.max(0, Math.floor((sh - th) / 2));
  const raw = img.get_raw_pixels();
  const out = new Uint8Array(tw * th * 4);
  const rowBytes = tw * 4;
  for (let y = 0; y < th; y++) {
    const src = ((y0 + y) * sw + x0) * 4;
    out.set(raw.subarray(src, src + rowBytes), y * rowBytes);
  }
  return new PhotonImage(out, tw, th);
}

/**
 * 把品牌上傳的原圖 cover 鋪滿畫布,只留一條窄邊。
 * 痛點字由後製色條疊在底部,這裡不挖大塊留白。
 * FB 橫式 1200×800;IG／Threads 直式 4:5。
 */
export async function composeAssetOnBrandCard(
  imageBytes: Uint8Array,
  brandSlug: string,
  landscape: boolean,
): Promise<Uint8Array> {
  const { PhotonImage, SamplingFilter, resize, watermark } = await loadPhoton();
  const shot = PhotonImage.new_from_byteslice(imageBytes);
  let canvas: PhotonImage | null = null;
  let resized: PhotonImage | null = null;
  let cropped: PhotonImage | null = null;
  try {
    const width = landscape ? 1200 : 1080;
    const height = landscape ? 800 : 1350;
    const bg = POSTER_BG[brandSlug] ?? POSTER_BG.homigo;
    canvas = fillCanvas(PhotonImage, width, height, bg);

    const pad = 14;
    const zoneW = width - pad * 2;
    const zoneH = height - pad * 2;
    const sw = Math.max(1, shot.get_width());
    const sh = Math.max(1, shot.get_height());
    const scale = Math.max(zoneW / sw, zoneH / sh);
    const tw = Math.max(zoneW, Math.ceil(sw * scale));
    const th = Math.max(zoneH, Math.ceil(sh * scale));
    resized = resize(shot, tw, th, SamplingFilter.Lanczos3);
    cropped = cropCenter(PhotonImage, resized, zoneW, zoneH);
    const x = pad + Math.round((zoneW - cropped.get_width()) / 2);
    const y = pad + Math.round((zoneH - cropped.get_height()) / 2);
    watermark(canvas, cropped, BigInt(Math.max(0, x)), BigInt(Math.max(0, y)));
    return canvas.get_bytes_jpeg(90);
  } finally {
    shot.free();
    canvas?.free();
    resized?.free();
    cropped?.free();
  }
}
