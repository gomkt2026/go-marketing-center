// 臨時測試:驗證 logo 程式化合成(與 functions/_shared/watermark.ts 相同邏輯)
// 用法:node scripts/test-watermark.mjs <底圖> <logo> <輸出.jpg> [bottom-left]
import { readFileSync, writeFileSync } from 'node:fs';
import { PhotonImage, SamplingFilter, resize, watermark } from '@cf-wasm/photon';

const LOGO_WIDTH_RATIO = 0.14;
const LOGO_HEIGHT_RATIO = 0.1;
const MARGIN_RATIO = 0.025;

function ensureAlpha(logo) {
  const raw = logo.get_raw_pixels();
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

const [basePath, logoPath, outPath, position = 'bottom-right'] = process.argv.slice(2);
const base = PhotonImage.new_from_byteslice(new Uint8Array(readFileSync(basePath)));
const logo = ensureAlpha(PhotonImage.new_from_byteslice(new Uint8Array(readFileSync(logoPath))));

const baseW = base.get_width();
const baseH = base.get_height();
const scale = Math.min(
  (baseW * LOGO_WIDTH_RATIO) / logo.get_width(),
  (baseH * LOGO_HEIGHT_RATIO) / logo.get_height(),
);
const targetW = Math.max(1, Math.round(logo.get_width() * scale));
const targetH = Math.max(1, Math.round(logo.get_height() * scale));
const resized = resize(logo, targetW, targetH, SamplingFilter.Lanczos3);

const margin = Math.round(baseW * MARGIN_RATIO);
const x = position === 'bottom-left' ? margin : baseW - targetW - margin;
const y = baseH - targetH - margin;
watermark(base, resized, BigInt(x), BigInt(y));

writeFileSync(outPath, base.get_bytes_jpeg(90));
console.log(`OK ${outPath}: base ${baseW}x${baseH}, logo → ${targetW}x${targetH} @ (${x},${y})`);
