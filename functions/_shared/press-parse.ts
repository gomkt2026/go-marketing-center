import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { fetchGoogleNews, fetchTaiwanNews } from './sources';
import { slugifyStoryKey } from './press';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_HTML_CHARS = 400_000;
const MAX_EXCERPT_CHARS = 2200;
const FETCH_TIMEOUT_MS = 12_000;

const OUTLET_BY_HOST: Record<string, string> = {
  'ctee.com.tw': '工商時報',
  'www.ctee.com.tw': '工商時報',
  'setn.com': '三立新聞網',
  'www.setn.com': '三立新聞網',
  'tw.news.yahoo.com': 'Yahoo新聞',
  'tw.yahoo.com': 'Yahoo新聞',
  'news.yahoo.com': 'Yahoo新聞',
  'mypeoplevol.com': '民眾新聞網',
  'www.mypeoplevol.com': '民眾新聞網',
  'taiwanpost.net': '臺灣郵報',
  'www.taiwanpost.net': '臺灣郵報',
  'chinatrends.news': '勢傳媒',
  'www.chinatrends.news': '勢傳媒',
  'ltn.com.tw': '自由時報',
  'news.ltn.com.tw': '自由時報',
  'udn.com': '聯合新聞網',
  'udn.com.tw': '聯合新聞網',
  'money.udn.com': '經濟日報',
  'chinatimes.com': '中國時報',
  'www.chinatimes.com': '中國時報',
  'ettoday.net': 'ETtoday',
  'www.ettoday.net': 'ETtoday',
  'cna.com.tw': '中央社',
  'www.cna.com.tw': '中央社',
  'tvbs.com.tw': 'TVBS',
  'news.tvbs.com.tw': 'TVBS',
  'ftvnews.com.tw': '民視新聞',
  'cts.com.tw': '華視新聞',
  'nownews.com': 'NOWnews',
  'www.nownews.com': 'NOWnews',
  'storm.mg': '風傳媒',
  'www.storm.mg': '風傳媒',
  'thenewslens.com': '關鍵評論網',
  'www.thenewslens.com': '關鍵評論網',
  'businessweekly.com.tw': '商業周刊',
  'bnext.com.tw': '數位時代',
  'technews.tw': '科技新報',
  'cnyes.com': '鉅亨網',
  'news.cnyes.com': '鉅亨網',
  'anue.com.tw': '鉅亨網',
  'wealth.com.tw': '財訊',
  'mirror.media': '鏡週刊',
  'www.mirrormedia.mg': '鏡週刊',
  'upmedia.mg': '上報',
  'www.upmedia.mg': '上報',
  'newtalk.tw': '新頭殼',
  'www.newtalk.tw': '新頭殼',
  'pts.org.tw': '公視新聞網',
  'news.pts.org.tw': '公視新聞網',
};

const BRAND_PRESS_QUERIES: Record<string, { queries: string[]; names: string[] }> = {
  homigo: { queries: ['Homigo', '匠管 Homigo', 'Inforcraft 租屋'], names: ['Homigo', '匠管', 'Inforcraft'] },
  taskgo: { queries: ['TaskGo', 'Task Go', '匠管 Task'], names: ['TaskGo', 'Task Go', '匠管'] },
  washgo: { queries: ['Washgo', 'WashGo', '匠管 洗衣'], names: ['Washgo', 'WashGo'] },
};

export interface ParsedPressCoverage {
  articleUrl: string;
  canonicalUrl: string;
  outlet: string;
  headline: string;
  publishedOn: string | null;
  summary: string;
  keyQuotes: string[];
  claimableFacts: string[];
  storyKey: string;
  fetched: boolean;
  parseNotes: string[];
}

export interface DiscoveredPressItem {
  title: string;
  url: string | null;
  snippet: string | null;
  outletGuess: string;
  kind: 'own_coverage' | 'industry_news' | 'noise' | 'unknown';
  alreadySaved: boolean;
}

export function assertPublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('連結格式不正確');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('只接受 http/https 連結');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    throw new Error('不支援內網連結');
  }
  return url;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function metaContent(html: string, key: string): string | null {
  const attr = escapeRe(key);
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${attr}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name|itemprop)=["']${attr}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeEntities(m[1]);
  }
  return null;
}

function firstMeta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const value = metaContent(html, key);
    if (value) return value;
  }
  return null;
}

function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1] ?? '') as unknown;
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])
          ? (parsed as { '@graph': unknown[] })['@graph']
          : [parsed];
      for (const node of nodes) {
        if (node && typeof node === 'object') out.push(node as Record<string, unknown>);
      }
    } catch {
      // 忽略壞掉的 JSON-LD
    }
  }
  return out;
}

function jsonLdText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object' && 'name' in value && typeof (value as { name: unknown }).name === 'string') {
    return (value as { name: string }).name.trim();
  }
  return null;
}

function toDateOnly(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString().slice(0, 10);
  const m = raw.match(/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

function dateFromUrl(url: string): string | null {
  const dashed = url.match(/\/(20\d{2})[/-](\d{1,2})[/-](\d{1,2})(?:\b|\/)/);
  if (dashed) return `${dashed[1]}-${dashed[2].padStart(2, '0')}-${dashed[3].padStart(2, '0')}`;
  const compact = url.match(/\/(20\d{2})(\d{2})(\d{2})(?:\b|\/)/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

function outletFromHost(hostname: string): string {
  const host = hostname.toLowerCase();
  if (OUTLET_BY_HOST[host]) return OUTLET_BY_HOST[host];
  const parts = host.replace(/^www\./, '').split('.');
  if (parts.length >= 2) {
    const base = parts.slice(-2).join('.');
    if (OUTLET_BY_HOST[base]) return OUTLET_BY_HOST[base];
    if (OUTLET_BY_HOST[`www.${base}`]) return OUTLET_BY_HOST[`www.${base}`];
  }
  return host.replace(/^www\./, '');
}

function splitHeadlineOutlet(headline: string): { headline: string; outlet?: string } {
  const parts = headline.split(/\s[-–—|｜]\s/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { headline };
  const last = parts[parts.length - 1];
  if (last.length > 0 && last.length <= 24) {
    return { headline: parts.slice(0, -1).join(' - '), outlet: last };
  }
  return { headline };
}

function visibleExcerpt(html: string): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return decodeEntities(text).slice(0, MAX_EXCERPT_CHARS);
}

async function fetchArticleHtml(url: string): Promise<{ html: string; finalUrl: string; status: number }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const html = (await res.text()).slice(0, MAX_HTML_CHARS);
  return { html, finalUrl: res.url || url, status: res.status };
}

function extractPageMeta(html: string, pageUrl: string): {
  headline: string;
  outlet: string;
  publishedOn: string | null;
  description: string;
} {
  const ld = extractJsonLd(html);
  const article = ld.find((n) => {
    const type = n['@type'];
    const types = Array.isArray(type) ? type : [type];
    return types.some((t) => typeof t === 'string' && /NewsArticle|Article|ReportageNewsArticle|BlogPosting/i.test(t));
  });

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawHeadline = firstMeta(html, ['og:title', 'twitter:title'])
    || jsonLdText(article?.headline)
    || (titleTag ? decodeEntities(titleTag.replace(/\s+/g, ' ')) : '')
    || '';
  const split = splitHeadlineOutlet(rawHeadline);

  const publisher = jsonLdText(article?.publisher) || jsonLdText(article?.sourceOrganization);
  const outlet = firstMeta(html, ['og:site_name', 'application-name', 'publisher'])
    || publisher
    || split.outlet
    || outletFromHost(new URL(pageUrl).hostname);

  const publishedOn = toDateOnly(
    firstMeta(html, ['article:published_time', 'article:published', 'pubdate', 'publishdate', 'datePublished', 'date'])
    || jsonLdText(article?.datePublished)
    || dateFromUrl(pageUrl),
  );

  const description = firstMeta(html, ['og:description', 'twitter:description', 'description'])
    || jsonLdText(article?.description)
    || '';

  return {
    headline: split.headline || rawHeadline,
    outlet,
    publishedOn,
    description,
  };
}

async function enrichWithAi(
  env: Env,
  brand: { name: string; slug: string },
  meta: { headline: string; outlet: string; publishedOn: string | null; description: string },
  excerpt: string,
): Promise<{ summary: string; keyQuotes: string[]; claimableFacts: string[]; outlet?: string; headline?: string; publishedOn?: string | null }> {
  return chatCompleteJson(env, {
    temperature: 0.2,
    maxTokens: 700,
    messages: [
      {
        role: 'system',
        content: [
          `你在幫「${brand.name}」整理第三方媒體報導的知識卡。`,
          '只根據提供的標題、出處、描述與有限摘錄整理。',
          '禁止逐字抄寫超過 20 字的連續原文，摘要必須是我們自己改寫的。',
          '不可發明媒體名稱、專訪、獎項或數字。摘錄裡沒有的事實不要寫進 claimableFacts。',
          '不要輸出全文。',
        ].join(''),
      },
      {
        role: 'user',
        content: [
          `品牌 slug:${brand.slug}`,
          `媒體名候選:${meta.outlet}`,
          `標題候選:${meta.headline}`,
          `日期候選:${meta.publishedOn ?? ''}`,
          `描述:${meta.description}`,
          `有限摘錄:${excerpt}`,
          '回傳 JSON:{"outlet":"媒體名","headline":"標題","publishedOn":"YYYY-MM-DD或空字串","summary":"80到140字我們自己寫的摘要","keyQuotes":["最多2句、每句不超過40字"],"claimableFacts":["可對外宣稱且摘錄支持的事實，最多4則"]}',
        ].join('\n'),
      },
    ],
  });
}

export async function parsePressUrl(
  env: Env,
  rawUrl: string,
  brand: { name: string; slug: string },
): Promise<ParsedPressCoverage> {
  const start = assertPublicHttpUrl(rawUrl);
  const notes: string[] = [];
  let fetched = false;
  let finalUrl = start.toString();
  let html = '';

  try {
    const page = await fetchArticleHtml(start.toString());
    finalUrl = page.finalUrl || finalUrl;
    html = page.html;
    fetched = page.status >= 200 && page.status < 400 && html.length > 200;
    if (!fetched) notes.push(`網站回傳 HTTP ${page.status}，僅能從網址推估部分欄位`);
  } catch (e) {
    notes.push(e instanceof Error ? `無法抓取頁面：${e.message}` : '無法抓取頁面');
  }

  const meta = html
    ? extractPageMeta(html, finalUrl)
    : {
      headline: '',
      outlet: outletFromHost(new URL(finalUrl).hostname),
      publishedOn: dateFromUrl(finalUrl),
      description: '',
    };

  if (!meta.headline) notes.push('找不到標題，請人工確認');
  const excerpt = html ? visibleExcerpt(html) : '';

  let summary = meta.description.slice(0, 180);
  let keyQuotes: string[] = [];
  let claimableFacts: string[] = [];
  let outlet = meta.outlet;
  let headline = meta.headline;
  let publishedOn = meta.publishedOn;

  if (headline || excerpt || meta.description) {
    try {
      const ai = await enrichWithAi(env, brand, meta, excerpt || meta.description);
      if (ai.outlet?.trim()) outlet = ai.outlet.trim();
      if (ai.headline?.trim()) headline = ai.headline.trim();
      const aiDate = toDateOnly(ai.publishedOn ?? null);
      if (aiDate) publishedOn = aiDate;
      if (ai.summary?.trim()) summary = ai.summary.trim();
      keyQuotes = (ai.keyQuotes ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 2);
      claimableFacts = (ai.claimableFacts ?? []).map((f) => f.trim()).filter(Boolean).slice(0, 4);
    } catch {
      notes.push('AI 摘要失敗，已改用頁面描述');
    }
  }

  if (!summary && meta.description) summary = meta.description.slice(0, 180);
  notes.push('第三方全文不會寫入資料庫，只保留標題、出處、摘要與短金句');

  return {
    articleUrl: start.toString(),
    canonicalUrl: finalUrl,
    outlet: outlet || outletFromHost(new URL(finalUrl).hostname),
    headline,
    publishedOn,
    summary,
    keyQuotes,
    claimableFacts,
    storyKey: slugifyStoryKey(`${brand.slug}-${headline || finalUrl}`),
    fetched,
    parseNotes: notes,
  };
}

function guessOutletFromTitle(title: string): string {
  const split = splitHeadlineOutlet(title);
  return split.outlet || '未標示媒體';
}

export async function discoverPressMentions(
  env: Env,
  brand: { id: string; name: string; slug: string },
): Promise<DiscoveredPressItem[]> {
  const config = BRAND_PRESS_QUERIES[brand.slug] ?? { queries: [brand.name], names: [brand.name] };
  const [gnewsList, generalNews] = await Promise.all([
    Promise.all(config.queries.map((q) => fetchGoogleNews(q, 6))),
    fetchTaiwanNews(12),
  ]);
  const gnews = gnewsList.flat();
  const nameHits = generalNews.filter((n) =>
    config.names.some((name) => (n.title + (n.snippet ?? '')).includes(name)),
  );

  const seen = new Set<string>();
  const candidates = [...gnews, ...nameHits].filter((c) => {
    const key = (c.url || c.title).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 16);

  const sql = getSql(env);
  const existing = await sql`
    SELECT article_url, headline FROM press_coverages WHERE brand_id = ${brand.id}::uuid
  `;
  const existingUrls = new Set(
    (existing as { article_url: string | null }[]).map((r) => r.article_url).filter((u): u is string => Boolean(u)),
  );
  const existingTitles = new Set((existing as { headline: string }[]).map((r) => r.headline));

  const base: DiscoveredPressItem[] = candidates.map((c) => ({
    title: c.title,
    url: c.url ?? null,
    snippet: c.snippet ?? null,
    outletGuess: guessOutletFromTitle(c.title),
    kind: 'unknown',
    alreadySaved: Boolean((c.url && existingUrls.has(c.url)) || existingTitles.has(c.title)),
  }));

  if (!base.length) return [];

  try {
    const listText = base.map((c, i) => `${i}. ${c.title}${c.snippet ? ` — ${c.snippet.slice(0, 120)}` : ''}`).join('\n');
    const classified = await chatCompleteJson<{ items: { index: number; kind: string; outlet: string }[] }>(env, {
      temperature: 0.1,
      maxTokens: 800,
      messages: [
        {
          role: 'system',
          content: `你在幫品牌「${brand.name}」分辨新聞。own_coverage=報導或點名本品牌/產品;industry_news=產業新聞但沒有報導本品牌;noise=無關。`,
        },
        {
          role: 'user',
          content: [
            `品牌名/產品名:${config.names.join('、')}`,
            listText,
            '回傳 JSON:{"items":[{"index":編號,"kind":"own_coverage|industry_news|noise","outlet":"媒體名"}]}',
          ].join('\n'),
        },
      ],
    });
    for (const item of classified.items ?? []) {
      const row = base[item.index];
      if (!row) continue;
      if (item.kind === 'own_coverage' || item.kind === 'industry_news' || item.kind === 'noise') {
        row.kind = item.kind;
      }
      if (item.outlet?.trim()) row.outletGuess = item.outlet.trim();
    }
  } catch {
    // 分類失敗仍回傳原始清單
  }

  return base.sort((a, b) => {
    const rank = { own_coverage: 0, unknown: 1, industry_news: 2, noise: 3 };
    return rank[a.kind] - rank[b.kind];
  });
}
