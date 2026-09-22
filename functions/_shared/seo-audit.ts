import type { Env } from './env';
import { getSql } from './db';
import { rowToCamel } from './case';
import { type SeoTopicSeed } from './prompts';
import { defaultWebsiteDestination } from './website-articles';
import { listSeoTopicsForBrand } from './seo-topics';

export type SeoPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type SeoFindingCategory =
  | 'indexability'
  | 'on_page'
  | 'content'
  | 'structured_data'
  | 'aeo'
  | 'trust'
  | 'internal_linking';

export interface SeoPageSnapshot {
  url: string;
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaLength: number;
  h1: string[];
  canonical: string | null;
  robotsMeta: string | null;
  ogTitle: string | null;
  ogImage: string | null;
  jsonLdTypes: string[];
  wordCount: number;
  hasNoindex: boolean;
  error?: string;
}

export interface SeoFinding {
  id: string;
  category: SeoFindingCategory;
  priority: SeoPriority;
  title: string;
  impact: string;
  evidence: string;
  recommendation: string;
  url?: string;
  contentTopic?: string;
}

export interface SeoContentGap {
  topic: string;
  angle: string;
  primaryKeyword?: string;
  relatedTerms?: string[];
  category?: SeoTopicSeed['category'];
  searchIntent?: SeoTopicSeed['searchIntent'];
  audience?: SeoTopicSeed['audience'];
  reason: string;
  priority: SeoPriority;
}

export interface SeoRecommendation {
  title: string;
  detail: string;
  owner: 'engineering' | 'content' | 'brand';
  priority: SeoPriority;
}

export interface SeoAuditRecord {
  id: string;
  brandId: string;
  siteUrl: string;
  healthScore: number;
  summary: string;
  beginnerReport: string;
  pages: SeoPageSnapshot[];
  findings: SeoFinding[];
  contentGaps: SeoContentGap[];
  recommendations: SeoRecommendation[];
  scoreBreakdown: Record<string, number>;
  createdAt: string;
}

const FETCH_MS = 8_000;
const MAX_HTML = 450_000;
const UA = 'GoMarketing-SEO-Advisor/1.0 (read-only audit; +https://go-marketing-center.pages.dev)';

const EXTRA_PATHS: Record<string, string[]> = {
  washgo: ['/blog', '/brands'],
  homigo: ['/blog'],
  taskgo: ['/blog', '/pricing'],
};

const FORBIDDEN_CLAIMS: Record<string, { re: RegExp; label: string }[]> = {
  washgo: [
    { re: /5,?000\s*\+|五千/, label: '未核實的「5,000+ 服務客戶」' },
    { re: /98\s*%|98％/, label: '未核實的「98% 客戶滿意度」' },
    { re: /保證不縮水/, label: '不可宣稱保證不縮水' },
  ],
  homigo: [
    { re: /市佔第一|市占第一/, label: '不可宣稱市佔第一' },
    { re: /保證收租/, label: '不可保證收租率' },
  ],
  taskgo: [
    { re: /500\s*\+\s*團隊/, label: '未核實的「500+ 團隊使用」' },
    { re: /提升\s*70\s*%|派工效率\s*提升/, label: '未核實的派工效率數據' },
  ],
};

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url.replace(/\/$/, '');
  }
}

function joinUrl(base: string, path: string): string {
  return `${originOf(base)}${path.startsWith('/') ? path : `/${path}`}`;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim();
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i');
  const match = tag.match(re);
  return match ? decodeHtml(match[2] ?? match[3] ?? '') : null;
}

function metaContent(html: string, key: string): string | null {
  const re = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const tag = match[0];
    const name = (attr(tag, 'name') || attr(tag, 'property') || '').toLowerCase();
    if (name === key.toLowerCase()) return attr(tag, 'content');
  }
  return null;
}

function allTags(html: string, tag: string): string[] {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  return [...html.matchAll(re)].map((m) => decodeHtml(m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))).filter(Boolean);
}

function linkRel(html: string, rel: string): string | null {
  const re = /<link\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const tag = match[0];
    if ((attr(tag, 'rel') || '').toLowerCase() === rel.toLowerCase()) return attr(tag, 'href');
  }
  return null;
}

function jsonLdTypes(html: string): string[] {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const types = new Set<string>();
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1]) as unknown;
      const walk = (node: unknown) => {
        if (!node) return;
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        if (typeof node === 'object') {
          const rec = node as Record<string, unknown>;
          const t = rec['@type'];
          if (typeof t === 'string') types.add(t);
          if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
          Object.values(rec).forEach(walk);
        }
      };
      walk(data);
    } catch {
      /* ignore invalid JSON-LD */
    }
  }
  return [...types];
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function zhCount(text: string): number {
  return text.replace(/\s+/g, '').length;
}

async function fetchUrl(url: string, accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'): Promise<{
  status: number | null;
  finalUrl: string | null;
  body: string;
  error?: string;
}> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: accept },
      signal: AbortSignal.timeout(FETCH_MS),
    });
    const raw = await res.text();
    return {
      status: res.status,
      finalUrl: res.url || url,
      body: raw.slice(0, MAX_HTML),
    };
  } catch (err) {
    return {
      status: null,
      finalUrl: null,
      body: '',
      error: err instanceof Error ? err.message : '無法連線',
    };
  }
}

function parsePage(url: string, status: number | null, finalUrl: string | null, html: string, error?: string): SeoPageSnapshot {
  const title = allTags(html, 'title')[0] ?? null;
  const metaDescription = metaContent(html, 'description');
  const robotsMeta = metaContent(html, 'robots');
  const h1 = allTags(html, 'h1');
  return {
    url,
    status,
    finalUrl,
    title,
    titleLength: zhCount(title || ''),
    metaDescription,
    metaLength: zhCount(metaDescription || ''),
    h1,
    canonical: linkRel(html, 'canonical'),
    robotsMeta,
    ogTitle: metaContent(html, 'og:title'),
    ogImage: metaContent(html, 'og:image'),
    jsonLdTypes: jsonLdTypes(html),
    wordCount: zhCount(visibleText(html)),
    hasNoindex: /noindex/i.test(robotsMeta || ''),
    error,
  };
}

function parseSitemapLocs(xml: string, limit = 12): string[] {
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const loc of locs) {
    if (seen.has(loc)) continue;
    seen.add(loc);
    out.push(loc);
    if (out.length >= limit) break;
  }
  return out;
}

function robotsSitemap(txt: string): string | null {
  const line = txt.split(/\r?\n/).find((l) => /^\s*sitemap\s*:/i.test(l));
  return line ? line.replace(/^\s*sitemap\s*:\s*/i, '').trim() : null;
}

function robotsDisallowAll(txt: string): boolean {
  return /^\s*user-agent:\s*\*\s*$/im.test(txt) && /^\s*disallow:\s*\/\s*$/im.test(txt);
}

function addFinding(
  findings: SeoFinding[],
  counters: Record<string, number>,
  partial: Omit<SeoFinding, 'id'>,
) {
  const code = partial.category.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  counters[code] = (counters[code] ?? 0) + 1;
  findings.push({
    ...partial,
    id: `SEO-${code}-${String(counters[code]).padStart(3, '0')}`,
  });
}

function healthFromFindings(findings: SeoFinding[], homepageOk: boolean): { score: number; breakdown: Record<string, number> } {
  const weights: Record<SeoPriority, number> = { P0: 14, P1: 7, P2: 3, P3: 1 };
  let penalty = 0;
  const breakdown: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const f of findings) {
    breakdown[f.priority] += 1;
    penalty += weights[f.priority];
  }
  let score = Math.max(8, 100 - penalty);
  if (!homepageOk) score = Math.min(score, 18);
  return { score, breakdown };
}

function beginnerReport(params: {
  brandName: string;
  siteUrl: string;
  score: number;
  findings: SeoFinding[];
  gaps: SeoContentGap[];
}): string {
  const p0 = params.findings.filter((f) => f.priority === 'P0');
  const p1 = params.findings.filter((f) => f.priority === 'P1');
  const lines = [
    `## ${params.brandName} 官網 SEO 懶人包`,
    '',
    `檢查網址：${params.siteUrl}`,
    `健康分數：**${params.score} / 100**。這是技術與內容健檢，不保證 Google 排名或 AI 引用。`,
    '',
    p0.length
      ? `先處理這 ${p0.length} 件會卡住收錄或傷害信任的事：${p0.map((f) => f.title).join('、')}。`
      : '首頁目前沒有會立刻擋住收錄的嚴重問題。',
    p1.length
      ? `接著補這 ${p1.length} 件會讓搜尋與 AI 比較難摘要的缺口：${p1.slice(0, 4).map((f) => f.title).join('、')}。`
      : '',
    params.gaps.length
      ? `內容面還缺 ${params.gaps.length} 篇對準搜尋的官網長文。建議先寫：${params.gaps.slice(0, 3).map((g) => g.primaryKeyword || g.topic).join('、')}。`
      : '主題庫裡的主力搜尋題，官網長文已開始覆蓋。',
    '',
    '### 建議你現在做的三件事',
    ...[...p0, ...p1, ...params.findings.filter((f) => f.priority === 'P2')]
      .slice(0, 3)
      .map((f, i) => `${i + 1}. ${f.recommendation}`),
    '',
    '方法論來源：Open SEO Advisor 顧問模式（技術健檢 + Finding 優先序）與文章寫手模式（E-E-A-T、先回答搜尋意圖）。Google 不把 llms.txt 當排名因素；FAQ schema 自 2026 年中不再出 rich result，FAQ 仍應寫成讀者看得到的問答。',
  ];
  return lines.filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n');
}

function summaryText(brandName: string, score: number, findings: SeoFinding[], gaps: SeoContentGap[]): string {
  const p0 = findings.filter((f) => f.priority === 'P0').length;
  const p1 = findings.filter((f) => f.priority === 'P1').length;
  return [
    `${brandName} 官網健康分數 ${score} 分。`,
    p0 ? `有 ${p0} 件 P0（收錄／信任風險）。` : '沒有 P0 收錄阻斷。',
    p1 ? `有 ${p1} 件 P1 應在本週處理。` : '',
    gaps.length ? `內容缺口 ${gaps.length} 題，可直接從報告產官網長文。` : '主力搜尋題已有對應長文規劃。',
  ].filter(Boolean).join('');
}

export function isMissingSeoAuditSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?seo_audits["']? does not exist/i.test(msg);
}

export async function applySeoAuditMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS seo_audits (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      site_url          TEXT NOT NULL,
      health_score      INTEGER NOT NULL,
      summary           TEXT NOT NULL DEFAULT '',
      beginner_report   TEXT NOT NULL DEFAULT '',
      pages             JSONB NOT NULL DEFAULT '[]',
      findings          JSONB NOT NULL DEFAULT '[]',
      content_gaps      JSONB NOT NULL DEFAULT '[]',
      recommendations   JSONB NOT NULL DEFAULT '[]',
      score_breakdown   JSONB NOT NULL DEFAULT '{}',
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_seo_audits_brand ON seo_audits(brand_id, created_at DESC)`;
  return ['table:seo_audits'];
}

async function loadCannotClaims(env: Env, brandId: string): Promise<string[]> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT statement FROM brand_rules
      WHERE brand_id = ${brandId}::uuid AND rule_type = 'cannot_claim'
    `;
    return (rows as { statement: string }[]).map((r) => r.statement).filter(Boolean);
  } catch {
    return [];
  }
}

async function loadWebsiteArticles(env: Env, brandId: string): Promise<{ title: string; status: string; body: string; seo: Record<string, unknown> }[]> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT c.title, c.status, v.body, v.seo_meta
      FROM contents c
      JOIN LATERAL (
        SELECT body, seo_meta
        FROM content_versions
        WHERE content_id = c.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE c.brand_id = ${brandId}::uuid
        AND c.content_type = 'article'
        AND (c.target_platform = 'website' OR c.target_platform IS NULL)
      ORDER BY c.created_at DESC
      LIMIT 80
    `;
    return (rows as { title: string; status: string; body: string; seo_meta: Record<string, unknown> }[]).map((r) => ({
      title: r.title,
      status: r.status,
      body: r.body || '',
      seo: r.seo_meta || {},
    }));
  } catch {
    return [];
  }
}

function pageByPath(pages: SeoPageSnapshot[], path: string): SeoPageSnapshot | undefined {
  return pages.find((p) => {
    try {
      return new URL(p.url).pathname.replace(/\/$/, '') === path.replace(/\/$/, '') ||
        (p.finalUrl && new URL(p.finalUrl).pathname.replace(/\/$/, '') === path.replace(/\/$/, ''));
    } catch {
      return p.url.includes(path);
    }
  });
}

export async function runBrandSeoAudit(
  env: Env,
  brand: { id: string; slug: string; name: string; blogBaseUrl?: string | null; websiteUrl?: string | null },
): Promise<Omit<SeoAuditRecord, 'id' | 'createdAt'>> {
  const fallback = defaultWebsiteDestination(brand.slug);
  const siteUrl = (brand.blogBaseUrl || fallback?.blogBaseUrl || brand.websiteUrl || '').replace(/\/$/, '');
  if (!siteUrl) {
    throw new Error('尚未設定官網網址（blog_base_url）');
  }

  const topicBank = await listSeoTopicsForBrand(env, brand.id, brand.slug);
  const extra = EXTRA_PATHS[brand.slug] ?? ['/blog'];
  const seedUrls = [
    siteUrl,
    joinUrl(siteUrl, '/robots.txt'),
    joinUrl(siteUrl, '/sitemap.xml'),
    joinUrl(siteUrl, '/llms.txt'),
    ...extra.map((p) => joinUrl(siteUrl, p)),
  ];

  const fetched = await Promise.all(seedUrls.map((url) => fetchUrl(url)));
  const byUrl = new Map(seedUrls.map((url, i) => [url, fetched[i]]));

  const home = byUrl.get(siteUrl)!;
  const robots = byUrl.get(joinUrl(siteUrl, '/robots.txt'))!;
  const sitemapRes = byUrl.get(joinUrl(siteUrl, '/sitemap.xml'))!;
  const llms = byUrl.get(joinUrl(siteUrl, '/llms.txt'))!;

  const sitemapLocs = sitemapRes.status && sitemapRes.status < 400
    ? parseSitemapLocs(sitemapRes.body)
    : [];
  const robotsTxt = robots.status === 200 ? robots.body : '';
  const declaredSitemap = robotsSitemap(robotsTxt);

  const moreUrls = sitemapLocs
    .filter((loc) => !seedUrls.includes(loc.replace(/\/$/, '')) && loc.startsWith(originOf(siteUrl)))
    .filter((loc) => /blog|article|knowledge|guide|pricing|brands|about/i.test(loc))
    .slice(0, 3);
  const moreFetched = await Promise.all(moreUrls.map((url) => fetchUrl(url)));

  const htmlPages: SeoPageSnapshot[] = [];
  const pageTexts: string[] = [];
  const homePage = parsePage(siteUrl, home.status, home.finalUrl, home.body, home.error);
  htmlPages.push(homePage);
  pageTexts.push(homeText);

  for (const path of extra) {
    const url = joinUrl(siteUrl, path);
    const res = byUrl.get(url)!;
    htmlPages.push(parsePage(url, res.status, res.finalUrl, res.body, res.error));
    pageTexts.push(`${url}\n${visibleText(res.body)}`);
  }
  moreUrls.forEach((url, i) => {
    const res = moreFetched[i];
    htmlPages.push(parsePage(url, res.status, res.finalUrl, res.body, res.error));
    pageTexts.push(`${url}\n${visibleText(res.body)}`);
  });

  const findings: SeoFinding[] = [];
  const counters: Record<string, number> = {};
  const homeOk = home.status === 200 && !home.error;
  const homeText = visibleText(home.body);

  if (!homeOk) {
    addFinding(findings, counters, {
      category: 'indexability',
      priority: 'P0',
      title: '官網首頁無法正常抓取',
      impact: '搜尋引擎與 AI 都讀不到內容，無法建立收錄。',
      evidence: home.error || `HTTP ${home.status ?? '無回應'}`,
      recommendation: '先確認 DNS、HTTPS 憑證與 Cloudflare 代理；修復後再重跑健檢。',
      url: siteUrl,
    });
  }

  const host = new URL(siteUrl).hostname;
  if (host.startsWith('dev.') || host.endsWith('.pages.dev') || host.endsWith('.workers.dev')) {
    addFinding(findings, counters, {
      category: 'indexability',
      priority: 'P0',
      title: '正式 SEO 不該放在測試／預覽網域',
      impact: '權重與品牌搜尋會落在錯誤網域；之後搬家還要做 301。',
      evidence: `目前稽核網址是 ${siteUrl}`,
      recommendation: '把 blog_base_url 改成正式網域（例如 https://www.taskgo.com.tw），並將測試站 robots 設為 Disallow。',
      url: siteUrl,
    });
  }

  if (robots.status !== 200) {
    addFinding(findings, counters, {
      category: 'indexability',
      priority: 'P1',
      title: '缺少可用的 robots.txt',
      impact: '爬蟲不知道哪些路徑可抓、sitemap 在哪。',
      evidence: robots.error || `HTTP ${robots.status ?? '無回應'}`,
      recommendation: '在官網根目錄提供 robots.txt，Allow: /，並宣告 Sitemap。',
      url: joinUrl(siteUrl, '/robots.txt'),
    });
  } else if (robotsDisallowAll(robotsTxt)) {
    addFinding(findings, counters, {
      category: 'indexability',
      priority: 'P0',
      title: 'robots.txt 阻擋全站',
      impact: 'Google 不能抓任何頁面。',
      evidence: robotsTxt.slice(0, 280),
      recommendation: '正式站改為 Allow: /，只擋後台與登入頁。',
      url: joinUrl(siteUrl, '/robots.txt'),
    });
  } else if (!declaredSitemap) {
    addFinding(findings, counters, {
      category: 'indexability',
      priority: 'P2',
      title: 'robots.txt 未宣告 Sitemap',
      impact: '新文章較慢被發現。',
      evidence: robotsTxt.slice(0, 280),
      recommendation: `加一行 Sitemap: ${joinUrl(siteUrl, '/sitemap.xml')}`,
      url: joinUrl(siteUrl, '/robots.txt'),
    });
  }

  if (!(sitemapRes.status === 200 && /<urlset|<sitemapindex/i.test(sitemapRes.body))) {
    addFinding(findings, counters, {
      category: 'indexability',
      priority: 'P1',
      title: 'sitemap.xml 缺失或格式不正確',
      impact: '文章與內頁不容易被發現。',
      evidence: sitemapRes.error || `HTTP ${sitemapRes.status ?? '無回應'}`,
      recommendation: '產出 UTF-8 的 urlset，至少包含首頁、知識列表與已發布文章。',
      url: joinUrl(siteUrl, '/sitemap.xml'),
    });
  } else if (!sitemapLocs.some((loc) => /blog|article|knowledge/i.test(loc))) {
    addFinding(findings, counters, {
      category: 'indexability',
      priority: 'P2',
      title: 'Sitemap 沒有知識／文章 URL',
      impact: '即使之後發布長文，搜尋引擎也不容易從 sitemap 找到。',
      evidence: `目前前幾筆：${sitemapLocs.slice(0, 5).join('、') || '空'}`,
      recommendation: '官網文章區上線後，把 /blog 與每篇 /blog/{slug} 寫進 sitemap，lastmod 用實際更新日期。',
      url: joinUrl(siteUrl, '/sitemap.xml'),
    });
  }

  if (homeOk) {
    if (!homePage.title) {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P0',
        title: '首頁缺少 <title>',
        impact: '搜尋結果沒有可用標題。',
        evidence: '原始 HTML 找不到 title 標籤。',
        recommendation: '寫 12–60 字、含品牌名與主服務的 title。',
        url: siteUrl,
      });
    } else if (homePage.titleLength < 8 || homePage.titleLength > 70) {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P2',
        title: '首頁 title 長度不理想',
        impact: '過短難說明服務，過長會被截斷。',
        evidence: `「${homePage.title}」（${homePage.titleLength} 字）`,
        recommendation: '壓在約 12–60 字，前段放搜尋詞、後段放品牌。',
        url: siteUrl,
      });
    }
    if (/_line|專案管理系統/i.test(homePage.title || '') && brand.slug === 'taskgo') {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P0',
        title: '首頁 title 不像對外品牌名',
        impact: '搜尋結果會顯示內部專案名，點擊率與品牌辨識都差。',
        evidence: `目前 title：${homePage.title}`,
        recommendation: '改成「TaskGo｜工程派工、打卡與現場回報」這類對外標題。',
        url: siteUrl,
      });
    }
    if (!homePage.metaDescription) {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P1',
        title: '首頁缺少 meta description',
        impact: '搜尋摘要可能被隨便截內文。',
        evidence: '未找到 meta name="description"。',
        recommendation: '寫 70–160 字，含主服務與地區（台灣）。',
        url: siteUrl,
      });
    }
    if (homePage.h1.length === 0) {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P1',
        title: '首頁沒有 H1',
        impact: '主題訊號弱，AEO 也不容易抽出「這頁在答什麼」。',
        evidence: 'HTML 沒有 h1。',
        recommendation: '放一個與可見主標一致的 H1，不要把主標只畫在圖片裡。',
        url: siteUrl,
      });
    } else if (homePage.h1.length > 1) {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P3',
        title: '首頁有多個 H1',
        impact: '主題焦點分散。',
        evidence: homePage.h1.slice(0, 4).join('／'),
        recommendation: '一頁一個 H1，其餘改 H2。',
        url: siteUrl,
      });
    }
    if (!homePage.canonical) {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P1',
        title: '首頁缺少 canonical',
        impact: 'www / 非 www、參數頁可能被當成重複內容。',
        evidence: '未找到 link rel="canonical"。',
        recommendation: `加上 canonical 指向 ${siteUrl}/ 或品牌指定的最終 HTTPS 網址。`,
        url: siteUrl,
      });
    }
    if (homePage.hasNoindex) {
      addFinding(findings, counters, {
        category: 'indexability',
        priority: 'P0',
        title: '首頁被設為 noindex',
        impact: '即使 sitemap 提交也不該被收錄。',
        evidence: homePage.robotsMeta || 'robots meta 含 noindex',
        recommendation: '正式行銷頁移除 noindex。',
        url: siteUrl,
      });
    }
    if (!homePage.ogTitle && !homePage.ogImage) {
      addFinding(findings, counters, {
        category: 'on_page',
        priority: 'P3',
        title: '缺少 Open Graph',
        impact: '社群分享預覽弱，不直接決定排名。',
        evidence: '未找到 og:title / og:image。',
        recommendation: '補 og:title、og:description、og:image（絕對網址）。',
        url: siteUrl,
      });
    }
    if (homePage.jsonLdTypes.length === 0) {
      addFinding(findings, counters, {
        category: 'structured_data',
        priority: 'P1',
        title: '首頁沒有 JSON-LD',
        impact: '搜尋與 AI 較難確認品牌、聯絡與組織實體。',
        evidence: '未解析到 application/ld+json。',
        recommendation: '首頁加 Organization（或 LocalBusiness，僅限真實營業地）。文章頁再加 Article；FAQ 可標記但不要期待 Google FAQ rich result。',
        url: siteUrl,
      });
    } else if (!homePage.jsonLdTypes.some((t) => /Organization|LocalBusiness|WebSite/i.test(t))) {
      addFinding(findings, counters, {
        category: 'structured_data',
        priority: 'P2',
        title: 'JSON-LD 未描述品牌實體',
        impact: '有標記但對品牌知識圖譜幫助有限。',
        evidence: `現有類型：${homePage.jsonLdTypes.join(', ')}`,
        recommendation: '補 Organization，欄位必須是頁面上真實可見的名稱與網址。',
        url: siteUrl,
      });
    }
  }

  const blogPage = pageByPath(htmlPages, '/blog');
  if (!blogPage || blogPage.status === 404 || (blogPage.status && blogPage.status >= 400) || blogPage.error) {
    addFinding(findings, counters, {
      category: 'content',
      priority: 'P1',
      title: '還沒有可被收錄的知識／文章區',
      impact: '搜尋意圖長尾只能靠首頁硬扛，官網長文無法累積權重。',
      evidence: blogPage ? `HTTP ${blogPage.status ?? '失敗'} ${blogPage.error ?? ''}` : '未檢查到 /blog',
      recommendation: '依既有官網長文契約做 /blog 伺服端 HTML（答案區 → 正文 → FAQ），不要等瀏覽器再 fetch。',
      url: joinUrl(siteUrl, '/blog'),
      contentTopic: topicBank[0]?.topic,
    });
  } else if (blogPage.wordCount < 200) {
    addFinding(findings, counters, {
      category: 'content',
      priority: 'P1',
      title: '文章列表頁幾乎沒有正文',
      impact: '空殼列表對 SEO / AEO 沒有幫助。',
      evidence: `可見文字約 ${blogPage.wordCount} 字`,
      recommendation: '列表頁至少要有索引說明、分類與已發布文章摘要；內文頁第一份 HTML 就要有 answer_box。',
      url: blogPage.url,
    });
  }

  if (llms.status !== 200) {
    addFinding(findings, counters, {
      category: 'aeo',
      priority: 'P3',
      title: '沒有 llms.txt',
      impact: '部分回答引擎可能讀不到站務說明。Google 官方不把它當排名因素。',
      evidence: llms.error || `HTTP ${llms.status ?? '無回應'}`,
      recommendation: '可選：在根目錄放簡短 llms.txt，說明品牌、可引用頁與聯絡方式。不要把它當成 AEO 必勝方法。',
      url: joinUrl(siteUrl, '/llms.txt'),
    });
  }

  const claimHits = FORBIDDEN_CLAIMS[brand.slug] ?? [];
  for (const claim of claimHits) {
    if (claim.re.test(homeText) || claim.re.test(homePage.title || '') || claim.re.test(homePage.metaDescription || '')) {
      addFinding(findings, counters, {
        category: 'trust',
        priority: 'P0',
        title: `官網出現不可核實宣稱：${claim.label}`,
        impact: '違反品牌不可宣稱規則，也傷害 E-E-A-T 的 Trust。',
        evidence: `首頁可見文案命中「${claim.label}」。`,
        recommendation: '立刻從官網拿掉或改成可查證的產品能力描述。長文生成已禁止發明客戶數與滿意度。',
        url: siteUrl,
      });
    }
  }

  const cannotClaims = await loadCannotClaims(env, brand.id);
  for (const statement of cannotClaims.slice(0, 12)) {
    const key = statement.replace(/\s+/g, '').slice(0, 8);
    if (key.length >= 4 && homeText.replace(/\s+/g, '').includes(key)) {
      addFinding(findings, counters, {
        category: 'trust',
        priority: 'P1',
        title: '首頁文案可能踩到品牌不可宣稱',
        impact: '行銷頁與品牌規則不一致。',
        evidence: statement.slice(0, 120),
        recommendation: '對照品牌智慧「不可宣稱」清單改寫首頁。',
        url: siteUrl,
      });
    }
  }

  const articles = await loadWebsiteArticles(env, brand.id);
  const published = articles.filter((a) => a.status === 'published' || a.status === 'scheduled');
  const drafted = articles.filter((a) => a.status === 'pending_review' || a.status === 'approved');
  const coveredText = [
    ...pageTexts,
    ...sitemapLocs,
    ...articles.map((a) => `${a.title} ${a.seo.primary_keyword || ''} ${(a.seo.related_terms as string[] | undefined)?.join(' ') || ''}`),
  ].join('\n');

  const gaps: SeoContentGap[] = [];
  for (const topic of topicBank) {
    const needle = (topic.primaryKeyword || topic.topic).replace(/\s+/g, '');
    const inPublished = published.some((a) =>
      `${a.title}${a.seo.primary_keyword || ''}`.replace(/\s+/g, '').includes(needle),
    );
    if (inPublished) continue;
    const onHome = coveredText.replace(/\s+/g, '').includes(needle);
    const inDraft = drafted.some((a) =>
      `${a.title}${a.seo.primary_keyword || ''}`.replace(/\s+/g, '').includes(needle),
    );
    gaps.push({
      topic: topic.topic,
      angle: topic.angle,
      primaryKeyword: topic.primaryKeyword,
      relatedTerms: topic.relatedTerms,
      category: topic.category,
      searchIntent: topic.searchIntent,
      audience: topic.audience,
      reason: inDraft
        ? '內容中心已有草稿，尚未發布到官網。'
        : onHome
          ? '首頁有提到這個詞，但沒有獨立可收錄的長文 URL。'
          : '主題庫有這題，官網與已發布長文都還沒覆蓋。',
      priority: inDraft ? 'P2' : onHome ? 'P1' : 'P1',
    });
  }

  if (published.length === 0) {
    addFinding(findings, counters, {
      category: 'content',
      priority: 'P1',
      title: '還沒有已發布的官網長文',
      impact: '搜尋與 AI 沒有可引用的深度頁。',
      evidence: drafted.length
        ? `內容中心有 ${drafted.length} 篇待審／已核准，但尚未 ingest 到官網。`
        : '內容中心尚無 website 頻道長文。',
      recommendation: '從下方內容缺口產文 → 內容中心審閱 → 一鍵發布到官網。',
      contentTopic: gaps[0]?.topic,
    });
  }

  if (homeOk && homePage.wordCount > 0 && !/(常見問題|FAQ|問與答)/.test(homeText)) {
    const faqExample = brand.slug === 'homigo'
      ? '房東收租怎麼管'
      : brand.slug === 'taskgo'
        ? '工程派工怎麼排'
        : '到府收送洗衣怎麼用';
    addFinding(findings, counters, {
      category: 'aeo',
      priority: 'P2',
      title: '首頁缺少可見的問答區塊',
      impact: '訪客與回答引擎都較難一次抓到條件與限制。FAQ schema 不是排名必備，但可見問答仍有幫助。',
      evidence: '首頁可見文字未出現 FAQ／常見問題。',
      recommendation: `用真實問題當 H2（例如「${faqExample}」），下面直接回答，不要只放動畫。`,
      url: siteUrl,
    });
  }

  const blogLinked = /\/blog|知識|教學中心|操作手冊/.test(home.body);
  if (!blogLinked) {
    addFinding(findings, counters, {
      category: 'internal_linking',
      priority: 'P2',
      title: '首頁沒有指向知識／文章區的內部連結',
      impact: '即使有長文，也可能變成孤兒頁。',
      evidence: '首頁 HTML 未找到 /blog 或知識入口。',
      recommendation: '導覽與頁尾加「租屋知識／工班知識／洗衣知識」連到列表頁。',
      url: siteUrl,
    });
  }

  const { score, breakdown } = healthFromFindings(findings, homeOk);
  const recs: SeoRecommendation[] = [
    ...findings.filter((f) => f.priority === 'P0' || f.priority === 'P1').slice(0, 6).map((f) => ({
      title: f.title,
      detail: f.recommendation,
      owner: (f.category === 'content' || f.category === 'aeo' ? 'content' : f.category === 'trust' ? 'brand' : 'engineering') as SeoRecommendation['owner'],
      priority: f.priority,
    })),
  ];
  if (gaps[0]) {
    recs.push({
      title: `先補搜尋題：${gaps[0].primaryKeyword || gaps[0].topic}`,
      detail: '用內容中心或本頁「產生這篇長文」，走 answer-first + FAQ，審核後發布到 /blog/{slug}。',
      owner: 'content',
      priority: 'P1',
    });
  }

  return {
    brandId: brand.id,
    siteUrl,
    healthScore: score,
    summary: summaryText(brand.name, score, findings, gaps),
    beginnerReport: beginnerReport({ brandName: brand.name, siteUrl, score, findings, gaps }),
    pages: [
      homePage,
      ...htmlPages.slice(1),
      parsePage(joinUrl(siteUrl, '/robots.txt'), robots.status, robots.finalUrl, '', robots.error),
      parsePage(joinUrl(siteUrl, '/sitemap.xml'), sitemapRes.status, sitemapRes.finalUrl, '', sitemapRes.error),
    ],
    findings,
    contentGaps: gaps,
    recommendations: recs,
    scoreBreakdown: breakdown,
  };
}

export async function saveSeoAudit(env: Env, audit: Omit<SeoAuditRecord, 'id' | 'createdAt'>): Promise<SeoAuditRecord> {
  const sql = getSql(env);
  const insert = () => sql`
    INSERT INTO seo_audits (
      brand_id, site_url, health_score, summary, beginner_report,
      pages, findings, content_gaps, recommendations, score_breakdown
    ) VALUES (
      ${audit.brandId}::uuid,
      ${audit.siteUrl},
      ${audit.healthScore},
      ${audit.summary},
      ${audit.beginnerReport},
      ${JSON.stringify(audit.pages)}::jsonb,
      ${JSON.stringify(audit.findings)}::jsonb,
      ${JSON.stringify(audit.contentGaps)}::jsonb,
      ${JSON.stringify(audit.recommendations)}::jsonb,
      ${JSON.stringify(audit.scoreBreakdown)}::jsonb
    )
    RETURNING *
  `;
  let rows;
  try {
    rows = await insert();
  } catch (err) {
    if (!isMissingSeoAuditSchema(err)) throw err;
    await applySeoAuditMigration(env);
    rows = await insert();
  }
  return mapAuditRow(rows[0] as Record<string, unknown>);
}

function mapAuditRow(row: Record<string, unknown>): SeoAuditRecord {
  const rec = rowToCamel<SeoAuditRecord>(row);
  return {
    ...rec,
    pages: Array.isArray(rec.pages) ? rec.pages : [],
    findings: Array.isArray(rec.findings) ? rec.findings : [],
    contentGaps: Array.isArray(rec.contentGaps) ? rec.contentGaps : [],
    recommendations: Array.isArray(rec.recommendations) ? rec.recommendations : [],
    scoreBreakdown: rec.scoreBreakdown && typeof rec.scoreBreakdown === 'object' ? rec.scoreBreakdown : {},
  };
}

export async function listSeoAudits(env: Env, brandId: string): Promise<SeoAuditRecord[]> {
  const sql = getSql(env);
  const run = () => sql`
    SELECT * FROM seo_audits
    WHERE brand_id = ${brandId}::uuid
    ORDER BY created_at DESC
    LIMIT 8
  `;
  try {
    return (await run() as Record<string, unknown>[]).map(mapAuditRow);
  } catch (err) {
    if (!isMissingSeoAuditSchema(err)) throw err;
    await applySeoAuditMigration(env);
    return [];
  }
}

export async function latestSeoAuditsByBrand(env: Env): Promise<SeoAuditRecord[]> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT DISTINCT ON (brand_id) *
      FROM seo_audits
      ORDER BY brand_id, created_at DESC
    `;
    return (rows as Record<string, unknown>[]).map(mapAuditRow);
  } catch (err) {
    if (!isMissingSeoAuditSchema(err)) throw err;
    return [];
  }
}
