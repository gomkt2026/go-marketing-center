import { initWasm, Resvg } from '@resvg/resvg-wasm';
import type { Env } from './env';
import { loadPhoton } from './photon-wasm';

// ============================================================================
// 海報主標後製:圖片模型不畫字,改用思源黑體 TW Bold 疊正確繁中。
// 字體從 R2 fonts/SourceHanSansTW-Bold.otf 讀取(與 podcast 同一份)。
// ============================================================================

export const POSTER_FONT_KEY = 'fonts/SourceHanSansTW-Bold.otf';
export const POSTER_FONT_FAMILY = 'Source Han Sans TW';
const RESVG_WASM_KEY = 'fonts/resvg-index_bg.wasm';

/** 給 gpt-image 的硬性規則:模型一畫中文就會錯字,主標改後製 */
export const POSTER_NO_GLYPHS_RULE = [
  'CRITICAL TYPOGRAPHY RULE: Do not render ANY letters, numbers, Chinese/Japanese/Korean characters, Latin text, UI labels, captions, watermarks, logos, or fake glyphs anywhere in the image. Typography is composited later in Traditional Chinese.',
  'PORTRAIT: leave the top 25% as empty designed paper or a clean brand-color block. No people, objects, icons, or text in that zone. Negative space is a design element for later type.',
  'LANDSCAPE: leave the left 38% as empty designed paper or a clean brand-color block for the headline and advantage line. Scene stays on the right.',
  'Poster composition: generous margins, one strong Taiwanese figure occupying 15–30% of the frame, optional tiny device card of abstract grey bars only (no glyphs). Looks like a finished editorial cover or graphic poster, not a screenshot dump and not a quote card.',
].join(' ');

const SIMP_TO_TRAD: Record<string, string> = {
  报: '報', 录: '錄', 记: '記', 纪: '紀', 门: '門', 发: '發', 无: '無', 这: '這',
  个: '個', 为: '為', 对: '對', 开: '開', 关: '關', 从: '從', 来: '來', 还: '還',
  过: '過', 后: '後', 会: '會', 时: '時', 间: '間', 里: '裡', 体: '體', 点: '點',
  线: '線', 单: '單', 东: '東', 车: '車', 长: '長', 业: '業', 产: '產', 经: '經',
  与: '與', 吗: '嗎', 么: '麼', 们: '們', 说: '說', 请: '請', 让: '讓', 给: '給',
  应: '應', 当: '當', 将: '將', 实: '實', 现: '現', 务: '務', 号: '號', 电: '電',
  语: '語', 计: '計', 设: '設', 坏: '壞', 约: '約', 柜: '櫃', 处: '處', 风: '風',
  湿: '濕', 干: '乾', 脏: '髒', 裤: '褲', 缮: '繕', 费: '費', 订: '訂', 缴: '繳',
  问: '問', 题: '題', 户: '戶', 帐: '帳', 钱: '錢', 价: '價', 场: '場', 区: '區',
  态: '態', 样: '樣', 头: '頭', 边: '邊', 进: '進', 运: '運', 选: '選', 证: '證',
  码: '碼', 页: '頁', 图: '圖', 钟: '鐘',   灯: '燈', 听: '聽', 见: '見', 帮: '幫',
  拢: '攏', 齐: '齊', 条: '條', 张: '張', 气: '氣', 热: '熱',
  难: '難', 马: '馬', 广: '廣', 厅: '廳', 楼: '樓',
  卫: '衛', 厨: '廚', 厕: '廁', 墙: '牆',
};

interface PosterTheme {
  banner: string;
  main: string;
  accent: string;
  stripe: string;
  advantage: string;
  kicker: string;
  bannerOpacity: number;
  slant: boolean;
  /** editorial = 紙本留白上的安靜小字; graphic = 斜切色塊海報; lively = 可愛品牌的圓潤主標 */
  mode: 'editorial' | 'graphic' | 'lively';
}

const THEME: Record<string, PosterTheme> = {
  homigo: {
    banner: '#F5F1EA', main: '#0B2D5C', accent: '#F7B500', stripe: '#F7B500',
    advantage: '#5C5346', kicker: '#0B2D5C',
    bannerOpacity: 0.0, slant: false, mode: 'editorial',
  },
  taskgo: {
    banner: '#0B2D5C', main: '#FFFFFF', accent: '#F7B500', stripe: '#2BA3D6',
    advantage: '#D7F0FA', kicker: '#2BA3D6',
    bannerOpacity: 0.94, slant: true, mode: 'graphic',
  },
  washgo: {
    banner: '#E6F2FF', main: '#1D4F8C', accent: '#3A8DDE', stripe: '#FFB84D',
    advantage: '#3A8DDE', kicker: '#3A8DDE',
    bannerOpacity: 0.0, slant: false, mode: 'lively',
  },
};

export const POSTER_ADVANTAGE_FALLBACK: Record<string, string> = {
  homigo: '把散落的事整理回同一個地方',
  washgo: '每件衣服都有送洗履歷',
  taskgo: '讓職人經驗變成可複製的標準',
};

let fontBytesCache: Uint8Array | null = null;
let fontLoading: Promise<Uint8Array | null> | null = null;
let resvgReady: Promise<void> | null = null;

async function ensureResvg(env: Env): Promise<void> {
  resvgReady ??= (async () => {
    if (env.MEDIA) {
      const obj = await env.MEDIA.get(RESVG_WASM_KEY);
      if (obj) {
        await initWasm(await obj.arrayBuffer());
        return;
      }
    }
    const res = await fetch('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm');
    if (!res.ok) throw new Error(`resvg wasm 下載失敗 (${res.status})`);
    await initWasm(res);
  })();
  return resvgReady;
}

export async function loadPosterFontBytes(env: Env): Promise<Uint8Array | null> {
  if (fontBytesCache) return fontBytesCache;
  fontLoading ??= (async () => {
    if (!env.MEDIA) return null;
    const obj = await env.MEDIA.get(POSTER_FONT_KEY);
    if (!obj) {
      console.warn(`[poster] R2 沒有 ${POSTER_FONT_KEY},略過主標後製`);
      return null;
    }
    fontBytesCache = new Uint8Array(await obj.arrayBuffer());
    return fontBytesCache;
  })();
  return fontLoading;
}

export function toTraditionalHeadline(raw: string): string {
  return [...raw].map((ch) => SIMP_TO_TRAD[ch] ?? ch).join('');
}

/** 4–12 字繁中主標;不夠就從文案第一句抽 */
export function sanitizePosterHeadline(raw: string | undefined, body: string): string {
  const clean = (s: string) => toTraditionalHeadline(
    s.replace(/[A-Za-z0-9#@]/g, '')
      .replace(/[「」『』""''']/g, '')
      .replace(/\s+/g, '')
      .trim(),
  );
  let s = clean(raw ?? '');
  if (s.length < 2) {
    const first = (body.split('\n').find((l) => l.trim()) ?? '').replace(/[「」『』""]/g, '');
    s = clean(first).slice(0, 10);
  }
  if (s.length > 12) s = s.slice(0, 10);
  return s;
}

export function splitPosterAccent(headline: string, accent?: string): { main: string; accent: string } {
  const given = toTraditionalHeadline((accent ?? '').trim());
  if (given && headline.endsWith(given) && headline.length > given.length) {
    return { main: headline.slice(0, headline.length - given.length), accent: given };
  }
  const m = headline.match(/^(.*?)([不沒怎嗎誰哪難].+)$/);
  if (m?.[1] && m[2] && m[1].length >= 2 && m[2].length >= 2) {
    return { main: m[1], accent: m[2] };
  }
  if (headline.length >= 7) {
    const mid = Math.ceil(headline.length / 2);
    return { main: headline.slice(0, mid), accent: headline.slice(mid) };
  }
  return { main: headline, accent: '' };
}

export function sanitizePosterAdvantage(raw: string | undefined, brandSlug: string): string {
  const fallback = POSTER_ADVANTAGE_FALLBACK[brandSlug] ?? POSTER_ADVANTAGE_FALLBACK.homigo;
  const clean = toTraditionalHeadline(
    (raw ?? '')
      .replace(/[A-Za-z0-9#@]/g, '')
      .replace(/[「」『』""''']/g, '')
      .replace(/\s+/g, '')
      .trim(),
  );
  if (clean.length < 6) return fallback;
  return clean.length > 18 ? clean.slice(0, 16) : clean;
}

export function sanitizePosterKicker(raw: string | undefined, brandSlug: string): string {
  if (brandSlug !== 'taskgo') return '';
  const word = (raw ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 14);
  if (word.length >= 3) return word;
  return 'STANDARD';
}

function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += /[\u4e00-\u9fff]/.test(ch) ? fontSize : fontSize * 0.62;
  }
  return w;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function bannerGeometry(width: number, height: number, landscape: boolean) {
  const pad = Math.round(width * (landscape ? 0.04 : 0.07));
  if (landscape) {
    return {
      x: 0,
      y: 0,
      w: Math.round(width * 0.38),
      h: height,
      pad,
    };
  }
  return {
    x: pad,
    y: Math.round(height * 0.05),
    w: width - pad * 2,
    h: Math.round(height * 0.22),
    pad,
  };
}

function letterSpacingPx(fontSize: number, mode: PosterTheme['mode']): number {
  if (mode === 'editorial') return Math.round(fontSize * 0.12);
  if (mode === 'lively') return Math.round(fontSize * 0.02);
  return 0;
}

function spacedWidth(text: string, fontSize: number, tracking: number): number {
  return estimateTextWidth(text, fontSize) + Math.max(0, text.length - 1) * tracking;
}

function buildGraphicBannerSvg(params: {
  geo: { x: number; y: number; w: number; h: number; pad: number };
  theme: PosterTheme;
  main: string;
  accent: string;
  advantage: string;
  kicker: string;
  landscape: boolean;
}): { svg: string; x: number; y: number } {
  const { geo, theme, main, accent, advantage, kicker, landscape } = params;
  const maxTextW = geo.w - geo.pad * 2;
  const lines = accent ? [main, accent] : [main];
  const longestLine = lines.reduce((a, b) => (a.length >= b.length ? a : b));
  let fontSize = landscape ? Math.round(geo.w * 0.14) : Math.round(geo.w * 0.12);
  while (estimateTextWidth(longestLine, fontSize) > maxTextW && fontSize > 32) {
    fontSize -= 4;
  }
  const kickerSize = Math.max(18, Math.round(fontSize * 0.32));
  const advSize = Math.max(18, Math.round(fontSize * 0.34));
  const lineGap = Math.round(fontSize * 1.12);
  const cx = Math.round(geo.w / 2);
  const kickerH = kicker ? Math.round(kickerSize * 1.6) : 0;
  const advH = advantage ? Math.round(advSize * 1.8) : 0;
  const blockH = (lines.length === 1 ? fontSize : fontSize + lineGap) + kickerH + advH;
  const startY = Math.round((geo.h - blockH) / 2 + fontSize * 0.82 + kickerH);
  const stripeH = Math.max(6, Math.round(geo.h * (landscape ? 0.012 : 0.03)));
  const skew = Math.round(geo.w * 0.14);

  const bg = `<polygon points="0,0 ${geo.w},0 ${geo.w - skew},${geo.h} 0,${geo.h}" fill="${theme.banner}" fill-opacity="${theme.bannerOpacity}"/>`;
  const kickerEl = kicker
    ? `<text x="${cx}" y="${startY - kickerH}" text-anchor="middle" font-family="${POSTER_FONT_FAMILY}" font-size="${kickerSize}" font-weight="700" fill="${theme.kicker}" letter-spacing="${Math.round(kickerSize * 0.28)}">${escapeXml(kicker)}</text>`
    : '';
  const texts = lines.map((line, i) => {
    const fill = i === 0 ? theme.main : theme.accent;
    const y = startY + i * lineGap;
    return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${POSTER_FONT_FAMILY}" font-size="${fontSize}" font-weight="700" fill="${fill}">${escapeXml(line)}</text>`;
  }).join('');
  const stripeY = Math.round(startY + (lines.length === 1 ? fontSize * 0.28 : lineGap + fontSize * 0.18));
  const stripeW = Math.round(Math.min(maxTextW * 0.36, estimateTextWidth(lines[lines.length - 1], fontSize) * 0.55));
  const stripe = `<rect x="${cx - Math.round(stripeW / 2)}" y="${stripeY}" width="${stripeW}" height="${stripeH}" rx="${Math.round(stripeH / 2)}" fill="${theme.stripe}"/>`;
  const advY = stripeY + stripeH + Math.round(advSize * 1.45);
  let advFont = advSize;
  while (estimateTextWidth(advantage, advFont) > maxTextW && advFont > 16) advFont -= 2;
  const advEl = advantage
    ? `<text x="${cx}" y="${advY}" text-anchor="middle" font-family="${POSTER_FONT_FAMILY}" font-size="${advFont}" font-weight="700" fill="${theme.advantage}">${escapeXml(advantage)}</text>`
    : '';

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${geo.w}" height="${geo.h}">`,
    bg, kickerEl, texts, stripe, advEl,
    '</svg>',
  ].join('');
  return { svg, x: geo.x, y: geo.y };
}

function buildEditorialSvg(params: {
  width: number;
  height: number;
  theme: PosterTheme;
  main: string;
  accent: string;
  advantage: string;
  landscape: boolean;
}): { svg: string; x: number; y: number } {
  const { width, height, theme, main, accent, advantage, landscape } = params;
  const pad = Math.round(width * (landscape ? 0.04 : 0.08));
  const colW = landscape ? Math.round(width * 0.38) : width;
  const cx = landscape ? Math.round(colW / 2) : Math.round(width / 2);
  const maxTextW = colW - pad * 2;
  const lines = accent ? [main, accent] : [main];
  const longest = lines.reduce((a, b) => (a.length >= b.length ? a : b));
  let fontSize = landscape ? Math.round(colW * 0.11) : Math.round(width * (theme.mode === 'lively' ? 0.078 : 0.072));
  while (spacedWidth(longest, fontSize, letterSpacingPx(fontSize, theme.mode)) > maxTextW && fontSize > 28) {
    fontSize -= 2;
  }
  const tracking = letterSpacingPx(fontSize, theme.mode);
  const lineGap = Math.round(fontSize * (theme.mode === 'lively' ? 1.14 : 1.22));
  const headY = landscape
    ? Math.round(height * 0.22 + fontSize * 0.8)
    : Math.round(height * 0.09 + fontSize * 0.8);
  const stripeH = Math.max(theme.mode === 'lively' ? 6 : 4, Math.round(fontSize * (theme.mode === 'lively' ? 0.12 : 0.08)));
  const texts = lines.map((line, i) => {
    const fill = i === 0 ? theme.main : theme.accent;
    const y = headY + i * lineGap;
    return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${POSTER_FONT_FAMILY}" font-size="${fontSize}" font-weight="700" fill="${fill}" letter-spacing="${tracking}">${escapeXml(line)}</text>`;
  }).join('');
  const stripeY = headY + (lines.length === 1 ? Math.round(fontSize * 0.28) : lineGap + Math.round(fontSize * 0.16));
  const stripeW = Math.round(Math.min(maxTextW * 0.28, estimateTextWidth(lines[lines.length - 1], fontSize) * 0.45));
  const stripe = `<rect x="${cx - Math.round(stripeW / 2)}" y="${stripeY}" width="${stripeW}" height="${stripeH}" rx="${Math.round(stripeH / 2)}" fill="${theme.stripe}" fill-opacity="0.9"/>`;

  let advSize = landscape ? Math.round(colW * 0.045) : Math.round(width * 0.032);
  const advTrack = letterSpacingPx(advSize, theme.mode);
  while (spacedWidth(advantage, advSize, advTrack) > maxTextW && advSize > 16) advSize -= 2;
  const advY = landscape ? Math.round(height * 0.88) : Math.round(height * 0.93);
  const advEl = advantage
    ? `<text x="${cx}" y="${advY}" text-anchor="middle" font-family="${POSTER_FONT_FAMILY}" font-size="${advSize}" font-weight="700" fill="${theme.advantage}" fill-opacity="0.88" letter-spacing="${letterSpacingPx(advSize, theme.mode)}">${escapeXml(advantage)}</text>`
    : '';

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    texts, stripe, advEl,
    '</svg>',
  ].join('');
  return { svg, x: 0, y: 0 };
}

export async function burnPosterHeadline(
  env: Env,
  imageBytes: Uint8Array,
  params: {
    brandSlug: string;
    headline?: string;
    accent?: string;
    advantage?: string;
    kicker?: string;
    body?: string;
    landscape?: boolean;
  },
): Promise<Uint8Array> {
  const headline = sanitizePosterHeadline(params.headline, params.body ?? '');
  if (headline.length < 2) return imageBytes;
  const fontBytes = await loadPosterFontBytes(env);
  if (!fontBytes) return imageBytes;
  await ensureResvg(env);

  const { PhotonImage, watermark } = await loadPhoton();
  const base = PhotonImage.new_from_byteslice(imageBytes);
  let mark: ReturnType<typeof PhotonImage.new_from_byteslice> | null = null;
  try {
    const width = base.get_width();
    const height = base.get_height();
    const landscape = params.landscape ?? width > height;
    const theme = THEME[params.brandSlug] ?? THEME.homigo;
    const split = splitPosterAccent(headline, params.accent);
    const advantage = sanitizePosterAdvantage(params.advantage, params.brandSlug);
    const kicker = sanitizePosterKicker(params.kicker, params.brandSlug);
    const overlay = theme.mode === 'graphic'
      ? buildGraphicBannerSvg({
        geo: bannerGeometry(width, height, landscape),
        theme, main: split.main, accent: split.accent,
        advantage, kicker, landscape,
      })
      : buildEditorialSvg({
        width, height, theme,
        main: split.main, accent: split.accent, advantage, landscape,
      });

    const resvg = new Resvg(overlay.svg, {
      fitTo: { mode: 'original' },
      font: {
        fontBuffers: [new Uint8Array(fontBytes)],
        defaultFontFamily: POSTER_FONT_FAMILY,
      },
    });
    const overlayPng = resvg.render().asPng();
    mark = PhotonImage.new_from_byteslice(overlayPng);
    watermark(base, mark, BigInt(overlay.x), BigInt(overlay.y));
    return base.get_bytes_jpeg(90);
  } finally {
    base.free();
    mark?.free();
  }
}
