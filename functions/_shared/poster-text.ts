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
  'PORTRAIT: leave the top 25% as a clean empty banner (solid or very soft brand-color gradient). No people, objects, icons, or text in that zone.',
  'LANDSCAPE: leave the left 38% as a clean empty banner for the headline. Scene and device card stay on the right.',
  'Poster composition: generous margins, one strong Taiwanese figure, a small white device/UI card in the lower third made of abstract grey bars and color blocks only (no glyphs). Looks like a finished brand poster, not a screenshot dump and not a quote card.',
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
  bannerOpacity: number;
  slant: boolean;
}

const THEME: Record<string, PosterTheme> = {
  homigo: {
    banner: '#F5F1EA', main: '#0B2D5C', accent: '#F7B500', stripe: '#F7B500',
    bannerOpacity: 0.96, slant: false,
  },
  taskgo: {
    banner: '#0B2D5C', main: '#FFFFFF', accent: '#F7B500', stripe: '#2BA3D6',
    bannerOpacity: 0.94, slant: true,
  },
  washgo: {
    banner: '#1D4F8C', main: '#FFFFFF', accent: '#FFB84D', stripe: '#FFB84D',
    bannerOpacity: 0.94, slant: false,
  },
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

function buildBannerSvg(params: {
  geo: { x: number; y: number; w: number; h: number; pad: number };
  theme: PosterTheme;
  main: string;
  accent: string;
  landscape: boolean;
}): { svg: string; x: number; y: number } {
  const { geo, theme, main, accent, landscape } = params;
  const maxTextW = geo.w - geo.pad * 2;
  const lines = accent ? [main, accent] : [main];
  const longestLine = lines.reduce((a, b) => (a.length >= b.length ? a : b));
  let fontSize = landscape ? Math.round(geo.w * 0.16) : Math.round(geo.w * 0.13);
  while (estimateTextWidth(longestLine, fontSize) > maxTextW && fontSize > 36) {
    fontSize -= 4;
  }
  const lineGap = Math.round(fontSize * 1.18);
  const blockH = lines.length === 1 ? fontSize : fontSize + lineGap;
  const cx = Math.round(geo.w / 2);
  const startY = Math.round((geo.h - blockH) / 2 + fontSize * 0.82);
  const rx = theme.slant ? 0 : Math.round(Math.min(geo.w, geo.h) * 0.08);
  const stripeH = Math.max(6, Math.round(geo.h * (landscape ? 0.012 : 0.035)));
  const skew = theme.slant ? Math.round(geo.w * 0.14) : 0;

  const bg = theme.slant
    ? `<polygon points="0,0 ${geo.w},0 ${geo.w - skew},${geo.h} 0,${geo.h}" fill="${theme.banner}" fill-opacity="${theme.bannerOpacity}"/>`
    : `<rect width="${geo.w}" height="${geo.h}" rx="${rx}" fill="${theme.banner}" fill-opacity="${theme.bannerOpacity}"/>`;

  const texts = lines.map((line, i) => {
    const fill = i === 0 ? theme.main : theme.accent;
    const y = startY + i * lineGap;
    return `<text x="${cx}" y="${y}" text-anchor="middle" font-family="${POSTER_FONT_FAMILY}" font-size="${fontSize}" font-weight="700" fill="${fill}">${escapeXml(line)}</text>`;
  }).join('');

  const stripeY = Math.round(startY + (lines.length === 1 ? fontSize * 0.28 : lineGap + fontSize * 0.18));
  const stripeW = Math.round(Math.min(maxTextW * 0.36, estimateTextWidth(lines[lines.length - 1], fontSize) * 0.55));
  const stripe = `<rect x="${cx - Math.round(stripeW / 2)}" y="${stripeY}" width="${stripeW}" height="${stripeH}" rx="${Math.round(stripeH / 2)}" fill="${theme.stripe}"/>`;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${geo.w}" height="${geo.h}">`,
    bg,
    texts,
    stripe,
    '</svg>',
  ].join('');
  return { svg, x: geo.x, y: geo.y };
}

export async function burnPosterHeadline(
  env: Env,
  imageBytes: Uint8Array,
  params: {
    brandSlug: string;
    headline: string;
    accent?: string;
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
    const geo = bannerGeometry(width, height, landscape);
    const overlay = buildBannerSvg({ geo, theme, main: split.main, accent: split.accent, landscape });

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
