import { PhotonImage, SamplingFilter, resize, watermark } from '@cf-wasm/photon';

// ============================================================================
// 品牌 logo 程式化合成(取代先前「叫圖片模型把 logo 畫進圖」的做法)
// 生成圖完成後,把真正的 logo 檔以固定比例、固定位置貼上:
// 永遠完整入鏡、不會被裁切、不會被模型重繪走樣。
// ============================================================================

/** logo 最大寬度佔圖寬比例 */
const LOGO_WIDTH_RATIO = 0.14;
/** logo 最大高度佔圖高比例(方形 logo 用高度限制,避免過大) */
const LOGO_HEIGHT_RATIO = 0.12;
/** 與邊緣的留白佔圖寬比例 */
const MARGIN_RATIO = 0.025;

/**
 * 白底 logo 轉透明:若 logo 沒有透明背景(整張 alpha 全不透明),
 * 以「越接近白色越透明」處理(alpha = 255 - min(r,g,b)),
 * 白底消失、彩色與深色線條保留,邊緣抗鋸齒自然過渡。
 * 已有透明背景的 logo 原樣回傳。
 */
function ensureAlpha(logo: PhotonImage): PhotonImage {
  const raw = logo.get_raw_pixels(); // RGBA
  let hasAlpha = false;
  for (let i = 3; i < raw.length; i += 4) {
    if (raw[i] < 250) { hasAlpha = true; break; }
  }
  if (hasAlpha) return logo;

  const w = logo.get_width();
  const h = logo.get_height();
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 4) {
    const r = raw[i], g = raw[i + 1], b = raw[i + 2];
    out[i] = r; out[i + 1] = g; out[i + 2] = b;
    out[i + 3] = 255 - Math.min(r, g, b);
  }
  logo.free();
  return new PhotonImage(out, w, h);
}

export type LogoPosition = 'bottom-right' | 'bottom-left';

/**
 * 把品牌 logo 合成到生成圖角落,回傳 JPEG bytes。
 * 任一步驟失敗時由呼叫端 catch,退回無 logo 的原圖。
 */
export function compositeLogo(
  imageBytes: Uint8Array,
  logoBytes: Uint8Array,
  opts?: { position?: LogoPosition },
): Uint8Array {
  const base = PhotonImage.new_from_byteslice(imageBytes);
  let logo: PhotonImage | null = null;
  let resized: PhotonImage | null = null;
  try {
    logo = ensureAlpha(PhotonImage.new_from_byteslice(logoBytes));

    const baseW = base.get_width();
    const baseH = base.get_height();
    // 同時受寬、高上限約束,寬型 wordmark 與方形 logo 都不會過大
    const scale = Math.min(
      (baseW * LOGO_WIDTH_RATIO) / logo.get_width(),
      (baseH * LOGO_HEIGHT_RATIO) / logo.get_height(),
    );
    const targetW = Math.max(1, Math.round(logo.get_width() * scale));
    const targetH = Math.max(1, Math.round(logo.get_height() * scale));
    resized = resize(logo, targetW, targetH, SamplingFilter.Lanczos3);

    const margin = Math.round(baseW * MARGIN_RATIO);
    const x = (opts?.position ?? 'bottom-right') === 'bottom-left'
      ? margin
      : baseW - targetW - margin;
    const y = baseH - targetH - margin;
    watermark(base, resized, BigInt(x), BigInt(y));

    return base.get_bytes_jpeg(90);
  } finally {
    base.free();
    logo?.free();
    resized?.free();
  }
}
