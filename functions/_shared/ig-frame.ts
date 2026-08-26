import { PhotonImage, SamplingFilter, resize, watermark } from '@cf-wasm/photon';

// ============================================================================
// 把素材庫橫式系統截圖包成 IG Feed 可發的 4:5 JPEG
//   Meta IG 只收約 4:5–1.91:1 的 JPEG;橫式 PNG 後台會直接 36003 拒收。
//   B 端不要裁掉報表欄位,改放進品牌色簡報框。
// ============================================================================

const IG_W = 1080;
const IG_H = 1350;
const PAD_X = 56;
const PAD_Y = 88;

const BRAND_BG: Record<string, [number, number, number]> = {
  washgo: [0x1d, 0x4f, 0x8c],
  homigo: [0x1a, 0x2b, 0x4a],
  taskgo: [0x2c, 0x2c, 0x2c],
};

function fillCanvas(w: number, h: number, rgb: [number, number, number]): PhotonImage {
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
export function frameScreenshotForIg(imageBytes: Uint8Array, brandSlug: string): Uint8Array {
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
    canvas = fillCanvas(IG_W, IG_H, bg);

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
    card = fillCanvas(cardW, cardH, [255, 255, 255]);
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
