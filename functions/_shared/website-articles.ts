import type { Env } from './env';
import { getSql } from './db';
import { encryptToken, decryptToken } from './crypto';

export type WebsiteCategory = 'pain' | 'product' | 'policy' | 'trust' | 'talk';
export type WebsiteAudience = 'consumer' | 'merchant';
export type WebsiteSearchIntent = 'informational' | 'solution';

export interface WebsiteFaq {
  question: string;
  answer: string;
}

export interface WebsiteSeoMeta {
  slug: string;
  title?: string;
  description?: string;
  seo_title: string;
  seo_description: string;
  primary_keyword: string;
  related_terms: string[];
  search_intent: WebsiteSearchIntent;
  category: WebsiteCategory;
  audience?: WebsiteAudience;
  answer_box: string;
  faq: WebsiteFaq[];
  tags?: string[];
  author?: string;
  cover_image_url?: string | null;
  og_image_url?: string | null;
  pillar?: string;
  brand_version_id?: string;
  market_signal_id?: string | null;
  public_url?: string;
  keywords?: string[];
  canonicalHint?: string;
}

export interface WebsiteArticlePayload {
  external_id: string;
  slug: string;
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  primary_keyword: string;
  related_terms: string[];
  search_intent: WebsiteSearchIntent;
  category: WebsiteCategory;
  audience?: WebsiteAudience;
  answer_box: string;
  body_md: string;
  faq: WebsiteFaq[];
  cta: string;
  status: 'published';
  published_at: string;
  cover_image_url?: string | null;
  og_image_url?: string | null;
  tags?: string[];
  author?: string;
  market_signal_id?: string | null;
  brand_version_id?: string;
  pillar?: string;
}

export interface WebsiteDestination {
  brandId: string;
  slug: string;
  blogBaseUrl: string;
  ingestBaseUrl: string;
  hasIngestKey: boolean;
  ingestKeyEnc: string | null;
}

const DEFAULT_DESTINATIONS: Record<string, { blogBaseUrl: string; ingestBaseUrl: string }> = {
  homigo: {
    blogBaseUrl: 'https://www.homigo.com.tw',
    ingestBaseUrl: 'https://housego-api.homigo.workers.dev',
  },
  taskgo: {
    blogBaseUrl: 'https://dev.taskgo.com.tw',
    ingestBaseUrl: 'https://api.dev.taskgo.com.tw',
  },
  washgo: {
    blogBaseUrl: 'https://washgo.com.tw',
    ingestBaseUrl: 'https://washgo-api.washgotaskgo.workers.dev',
  },
};

const SLUG_RE = /^[a-z0-9-]{3,80}$/;
const CATEGORIES: WebsiteCategory[] = ['pain', 'product', 'policy', 'trust', 'talk'];

export function isWebsiteSeoContent(content: {
  contentType?: string | null;
  content_type?: string | null;
  targetPlatform?: string | null;
  target_platform?: string | null;
}): boolean {
  const type = content.contentType ?? content.content_type;
  const platform = content.targetPlatform ?? content.target_platform;
  return type === 'article' && (platform === 'website' || !platform);
}

export function isMissingWebsiteArticleSchema(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?(blog_base_url|ingest_base_url|ingest_key_enc)["']? does not exist/i.test(msg)
    || /invalid input value for enum publishing_platform: ["']?website["']?/i.test(msg);
}

export async function applyWebsiteArticleMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  const steps: string[] = [];
  try {
    await sql`ALTER TYPE publishing_platform ADD VALUE IF NOT EXISTS 'website'`;
    steps.push('enum:publishing_platform.website');
  } catch (e) {
    steps.push(`enum:skipped:${e instanceof Error ? e.message : 'failed'}`);
  }
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS blog_base_url TEXT`;
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS ingest_base_url TEXT`;
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS ingest_key_enc TEXT`;
  steps.push('columns:brands.blog_ingest');
  await sql`
    UPDATE brands SET
      blog_base_url = COALESCE(blog_base_url, 'https://www.homigo.com.tw'),
      ingest_base_url = COALESCE(ingest_base_url, 'https://housego-api.homigo.workers.dev')
    WHERE slug = 'homigo'
  `;
  await sql`
    UPDATE brands SET
      blog_base_url = COALESCE(blog_base_url, 'https://dev.taskgo.com.tw'),
      ingest_base_url = COALESCE(ingest_base_url, 'https://api.dev.taskgo.com.tw')
    WHERE slug = 'taskgo'
  `;
  await sql`
    UPDATE brands SET
      blog_base_url = COALESCE(blog_base_url, 'https://washgo.com.tw'),
      ingest_base_url = COALESCE(ingest_base_url, 'https://washgo-api.washgotaskgo.workers.dev')
    WHERE slug = 'washgo'
  `;
  steps.push('seed:blog_ingest_urls');
  return steps;
}

export function websiteCta(slug: string, audience?: string | null): string {
  if (slug === 'homigo') {
    return '想把催繳、逾期與對帳放在同一處，加入 Homigo LINE 官方帳號 @933pdush，免費開始、不綁信用卡。';
  }
  if (slug === 'taskgo') {
    return '想把打卡、排班與請款放在同一處，免費試用 TaskGo 14 天（不綁信用卡），或加入 LINE 官方帳號 @taskgo。';
  }
  if (slug === 'washgo' && audience === 'merchant') {
    return '想了解洗衣店怎麼用同一套流程管訂單與門市，請來信 hello@washgo.com.tw。';
  }
  if (slug === 'washgo') {
    return '想把到府收衣服、線上報價和衣物追蹤放在同一處，加入 Washgo LINE 官方帳號 @washgo，加入即可下單。';
  }
  return '想了解更多，歡迎到品牌官網閱讀完整說明。';
}

export function websiteCtaRule(slug: string, audience?: string | null): string {
  if (slug === 'homigo') {
    return '官網長文文末 CTA 必須含 LINE @933pdush。禁止把匠管信箱當主 CTA。禁止開頭先推 Homigo。';
  }
  if (slug === 'taskgo') {
    return '官網長文文末 CTA 必須含免費試用 14 天或 LINE @taskgo。禁止開頭先廣告。禁止「全台第一」。';
  }
  if (slug === 'washgo' && audience === 'merchant') {
    return '業者文文末 CTA 必須含 hello@washgo.com.tw。禁止把後台登入當主 CTA。禁止洗車聯想。';
  }
  if (slug === 'washgo') {
    return '消費者文文末 CTA 必須含 @washgo 或 line.me/R/ti/p/@washgo。禁止洗車、未核實客戶數、保證不縮水。';
  }
  return '文末才放品牌與行動呼籲。';
}

export function websiteAuthor(slug: string): string {
  if (slug === 'homigo') return 'Homigo';
  if (slug === 'taskgo') return 'TaskGo';
  if (slug === 'washgo') return 'Washgo';
  return slug;
}

export function ingestPutPath(slug: string): string {
  return slug === 'washgo'
    ? '/v1/integrations/gomarketing/articles'
    : '/api/integrations/gomarketing/articles';
}

export function ingestUnpublishPath(slug: string, externalId: string): string {
  const prefix = slug === 'washgo' ? '/v1' : '/api';
  return `${prefix}/integrations/gomarketing/articles/${encodeURIComponent(externalId)}/unpublish`;
}

export function zhCharCount(text: string): number {
  return (text || '').replace(/\s+/g, '').length;
}

export function clipZh(text: string, max: number): string {
  const source = (text || '').replace(/\s+/g, ' ').trim();
  if (zhCharCount(source) <= max) return source;
  let out = '';
  let count = 0;
  for (const ch of source) {
    if (/\s/.test(ch)) {
      if (out) out += ch;
      continue;
    }
    if (count >= max) break;
    out += ch;
    count += 1;
  }
  return out.trim();
}

export function ensureZhRange(text: string, min: number, max: number, extras: string[] = []): string {
  let current = (text || '').replace(/\s+/g, ' ').trim();
  if (zhCharCount(current) > max) return clipZh(current, max);
  if (zhCharCount(current) >= min) return current;
  for (const extra of extras) {
    const piece = (extra || '').replace(/\s+/g, ' ').trim();
    if (!piece) continue;
    const needle = piece.slice(0, Math.min(16, piece.length));
    if (needle && current.includes(needle)) continue;
    const glue = !current ? '' : /[。！？、，；]$/.test(current) ? '' : '。';
    current = `${current}${glue}${piece}`;
    if (zhCharCount(current) >= min) return clipZh(current, max);
  }
  return clipZh(current, max);
}

export function ensureWebsiteSeoMetaLengths(meta: WebsiteSeoMeta, fallbackTitle = ''): WebsiteSeoMeta {
  const titleHint = meta.seo_title || meta.title || fallbackTitle;
  const extras = [meta.answer_box, titleHint, meta.primary_keyword, (meta.related_terms || []).join('、')];
  const description = ensureZhRange(meta.description || meta.seo_description || '', 40, 160, extras);
  const seo_description = ensureZhRange(
    meta.seo_description || description,
    70,
    160,
    [meta.answer_box, description, titleHint],
  );
  const answer_box = ensureZhRange(meta.answer_box, 80, 150, [description, titleHint, meta.primary_keyword]);
  const seo_title = ensureZhRange(meta.seo_title || titleHint, 12, 60, [meta.primary_keyword, titleHint]);
  return {
    ...meta,
    description,
    seo_description,
    answer_box,
    title: meta.title || seo_title,
    seo_title,
  };
}

export function sanitizeSlug(raw: string, fallback: string): string {
  const fromRaw = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  if (SLUG_RE.test(fromRaw)) return fromRaw;
  const fromFallback = fallback
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  if (SLUG_RE.test(fromFallback)) return fromFallback;
  return 'website-article';
}

function asCategory(value: unknown): WebsiteCategory {
  return CATEGORIES.includes(value as WebsiteCategory) ? value as WebsiteCategory : 'pain';
}

function asIntent(value: unknown): WebsiteSearchIntent {
  return value === 'informational' ? 'informational' : 'solution';
}

function asAudience(value: unknown): WebsiteAudience | undefined {
  if (value === 'merchant' || value === 'consumer') return value;
  return undefined;
}

function normalizeFaq(raw: unknown): WebsiteFaq[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as { question?: string; answer?: string; q?: string; a?: string };
    return {
      question: String(row.question || row.q || '').trim(),
      answer: String(row.answer || row.a || '').trim(),
    };
  }).filter((f) => f.question && f.answer).slice(0, 5);
}

export function normalizeWebsiteSeoMeta(input: Partial<WebsiteSeoMeta> & Record<string, unknown>, slug: string): WebsiteSeoMeta {
  const relatedRaw = input.related_terms ?? input.relatedTerms ?? input.keywords;
  const related = Array.isArray(relatedRaw)
    ? relatedRaw.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const faq = normalizeFaq(input.faq);
  const primary = String(input.primary_keyword || input.primaryKeyword || related[0] || '').trim() || '服務說明';
  const seoTitle = String(input.seo_title || input.seoTitle || input.title || '').trim();
  const listDesc = String(input.description || '').trim();
  const seoDesc = String(input.seo_description || input.seoDescription || '').trim();
  const articleSlug = sanitizeSlug(String(input.slug || ''), primary);
  return ensureWebsiteSeoMetaLengths({
    slug: articleSlug,
    title: seoTitle,
    description: listDesc || seoDesc,
    seo_title: seoTitle,
    seo_description: seoDesc || listDesc,
    primary_keyword: primary.slice(0, 20),
    related_terms: related.slice(0, 12),
    search_intent: asIntent(input.search_intent || input.searchIntent),
    category: asCategory(input.category),
    audience: slug === 'washgo' ? (asAudience(input.audience) ?? 'consumer') : asAudience(input.audience),
    answer_box: String(input.answer_box || input.answerBox || '').trim(),
    faq,
    tags: Array.isArray(input.tags) ? input.tags.map((t) => String(t)).slice(0, 8) : undefined,
    author: String(input.author || websiteAuthor(slug)),
    cover_image_url: typeof input.cover_image_url === 'string' ? input.cover_image_url : (typeof input.coverImageUrl === 'string' ? input.coverImageUrl : null),
    og_image_url: typeof input.og_image_url === 'string' ? input.og_image_url : (typeof input.ogImageUrl === 'string' ? input.ogImageUrl : null),
    pillar: input.pillar ? String(input.pillar) : undefined,
    brand_version_id: input.brand_version_id ? String(input.brand_version_id) : (input.brandVersionId ? String(input.brandVersionId) : undefined),
    market_signal_id: input.market_signal_id ? String(input.market_signal_id) : (input.marketSignalId ? String(input.marketSignalId) : null),
    public_url: input.public_url ? String(input.public_url) : (input.publicUrl ? String(input.publicUrl) : undefined),
    keywords: related.slice(0, 12),
    canonicalHint: input.canonicalHint ? String(input.canonicalHint) : `/blog/${articleSlug}`,
  }, seoTitle);
}

export function validateWebsitePayload(params: {
  slug: string;
  title: string;
  description: string;
  seoMeta: WebsiteSeoMeta;
  bodyMd: string;
  cta: string;
}): string[] {
  const errors: string[] = [];
  const { seoMeta, bodyMd, cta, title, description } = params;
  if (!SLUG_RE.test(seoMeta.slug)) errors.push('slug 須為 3–80 字元小寫英文、數字、連字號');
  const titleLen = zhCharCount(title);
  const descLen = zhCharCount(description);
  const seoDescLen = zhCharCount(seoMeta.seo_description);
  const answerLen = zhCharCount(seoMeta.answer_box);
  if (titleLen < 12 || titleLen > 60) errors.push(`title 須 12–60 字（目前 ${titleLen}）`);
  if (descLen < 40 || descLen > 160) errors.push(`description 須 40–160 字（目前 ${descLen}）`);
  if (seoDescLen < 70 || seoDescLen > 160) errors.push(`seo_description 須 70–160 字（目前 ${seoDescLen}）`);
  if (!seoMeta.primary_keyword || seoMeta.primary_keyword.length < 2) errors.push('須有主關鍵字');
  if (seoMeta.related_terms.length < 6) errors.push('related_terms 至少 6 個');
  if (answerLen < 80 || answerLen > 150) {
    errors.push(`answer_box 須 80–150 字（目前 ${answerLen}）`);
  }
  const bodyLen = zhCharCount(bodyMd);
  if (bodyLen < 800) errors.push(`正文須至少 800 字（目前 ${bodyLen}）`);
  if (bodyLen > 1800) errors.push(`正文勿超過 1800 字（目前 ${bodyLen}）`);
  if (new TextEncoder().encode(bodyMd).length > 50 * 1024) errors.push('body_md 過長');
  if (seoMeta.faq.length < 3) errors.push('FAQ 至少 3 題');
  if (seoMeta.category === 'policy' && !seoMeta.market_signal_id) {
    errors.push('政策時事文必須綁 market_signal_id');
  }
  if (params.slug === 'homigo' && !/@933pdush|lin\.ee/i.test(cta)) {
    errors.push('Homigo CTA 須含 @933pdush');
  }
  if (params.slug === 'taskgo' && !(/@taskgo/i.test(cta) || /試用/.test(cta))) {
    errors.push('TaskGo CTA 須含免費試用或 @taskgo');
  }
  if (params.slug === 'washgo') {
    if (seoMeta.audience === 'merchant') {
      if (!/hello@washgo\.com\.tw/i.test(cta)) errors.push('業者 CTA 須含 hello@washgo.com.tw');
    } else if (!/@washgo|line\.me\/R\/ti\/p\/@washgo/i.test(cta)) {
      errors.push('消費者 CTA 須含 @washgo');
    }
    if (/洗車|汽車美容|車體鍍膜/.test(`${title}${bodyMd}${seoMeta.answer_box}`)) {
      errors.push('Washgo 文不得出現洗車聯想');
    }
  }
  return errors;
}

export async function loadWebsiteDestination(env: Env, brandId: string): Promise<WebsiteDestination | null> {
  const sql = getSql(env);
  const run = () => sql`
    SELECT id, slug, blog_base_url, ingest_base_url, ingest_key_enc
    FROM brands WHERE id = ${brandId}::uuid LIMIT 1
  `;
  let rows;
  try {
    rows = await run();
  } catch (e) {
    if (!isMissingWebsiteArticleSchema(e)) throw e;
    await applyWebsiteArticleMigration(env);
    rows = await run();
  }
  if (!rows.length) return null;
  const row = rows[0] as {
    id: string; slug: string; blog_base_url: string | null;
    ingest_base_url: string | null; ingest_key_enc: string | null;
  };
  const fallback = DEFAULT_DESTINATIONS[row.slug];
  return {
    brandId: row.id,
    slug: row.slug,
    blogBaseUrl: (row.blog_base_url || fallback?.blogBaseUrl || '').replace(/\/$/, ''),
    ingestBaseUrl: (row.ingest_base_url || fallback?.ingestBaseUrl || '').replace(/\/$/, ''),
    hasIngestKey: Boolean(row.ingest_key_enc),
    ingestKeyEnc: row.ingest_key_enc,
  };
}

export function publicArticleUrl(blogBaseUrl: string, articleSlug: string): string {
  return `${blogBaseUrl.replace(/\/$/, '')}/blog/${articleSlug}`;
}

export function buildWebsitePayload(params: {
  contentId: string;
  title: string;
  bodyMd: string;
  cta: string;
  seoMeta: WebsiteSeoMeta;
  publishedAt?: string;
}): WebsiteArticlePayload {
  const meta = params.seoMeta;
  return {
    external_id: params.contentId,
    slug: meta.slug,
    title: params.title,
    description: meta.description || meta.seo_description,
    seo_title: meta.seo_title || params.title,
    seo_description: meta.seo_description || meta.description || '',
    primary_keyword: meta.primary_keyword,
    related_terms: meta.related_terms,
    search_intent: meta.search_intent,
    category: meta.category,
    audience: meta.audience,
    answer_box: meta.answer_box,
    body_md: params.bodyMd,
    faq: meta.faq,
    cta: params.cta,
    status: 'published',
    published_at: params.publishedAt || new Date().toISOString(),
    cover_image_url: meta.cover_image_url || null,
    og_image_url: meta.og_image_url || meta.cover_image_url || null,
    tags: meta.tags,
    author: meta.author,
    market_signal_id: meta.market_signal_id || null,
    brand_version_id: meta.brand_version_id,
    pillar: meta.pillar,
  };
}

interface IngestOk {
  success: true;
  article: { external_id: string; slug: string; status: string; public_url: string };
}

async function ingestFetch(params: {
  dest: WebsiteDestination;
  key: string;
  method: 'PUT' | 'POST';
  path: string;
  body?: unknown;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  const url = `${params.dest.ingestBaseUrl}${params.path}`;
  const res = await fetch(url, {
    method: params.method,
    headers: {
      'content-type': 'application/json',
      'X-Go-Marketing-Key': params.key,
      Authorization: `Bearer ${params.key}`,
      'X-Api-Key': params.key,
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });
  const json = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { status: res.status, json };
}

export async function publishWebsiteArticle(
  env: Env,
  dest: WebsiteDestination,
  payload: WebsiteArticlePayload,
): Promise<IngestOk> {
  if (!dest.ingestBaseUrl) throw new Error('尚未設定官網 ingest 網址');
  if (!dest.ingestKeyEnc) throw new Error('尚未填入官網 ingest 金鑰（品牌智慧 → 官方網站）');
  const key = await decryptToken(env, dest.ingestKeyEnc);
  const { status, json } = await ingestFetch({
    dest,
    key,
    method: 'PUT',
    path: ingestPutPath(dest.slug),
    body: payload,
  });
  if (status === 401) throw new Error('官網 ingest 金鑰不正確（401）');
  if (status === 409) throw new Error(String(json.error || 'slug 已被另一篇文章使用（409）'));
  if (status === 404) throw new Error('找不到 ingest 路徑，請確認對方 API 已上線');
  if (status >= 400) {
    throw new Error(String(json.error || `官網 ingest 失敗（${status}）`));
  }
  const article = (json.article ?? {}) as Record<string, unknown>;
  const publicUrl = String(article.public_url || publicArticleUrl(dest.blogBaseUrl, payload.slug));
  return {
    success: true,
    article: {
      external_id: String(article.external_id || payload.external_id),
      slug: String(article.slug || payload.slug),
      status: String(article.status || 'published'),
      public_url: publicUrl,
    },
  };
}

export async function unpublishWebsiteArticle(
  env: Env,
  dest: WebsiteDestination,
  externalId: string,
): Promise<void> {
  if (!dest.ingestKeyEnc) throw new Error('尚未填入官網 ingest 金鑰');
  const key = await decryptToken(env, dest.ingestKeyEnc);
  const { status, json } = await ingestFetch({
    dest,
    key,
    method: 'POST',
    path: ingestUnpublishPath(dest.slug, externalId),
  });
  if (status === 401) throw new Error('官網 ingest 金鑰不正確（401）');
  if (status === 404) throw new Error('對方找不到這篇文章（404）');
  if (status >= 400) throw new Error(String(json.error || `下架失敗（${status}）`));
}

export async function testWebsiteIngest(env: Env, dest: WebsiteDestination): Promise<{ ok: boolean; message: string }> {
  if (!dest.ingestBaseUrl) return { ok: false, message: '尚未設定 ingest 網址' };
  if (!dest.ingestKeyEnc) return { ok: false, message: '尚未填入 ingest 金鑰' };
  const key = await decryptToken(env, dest.ingestKeyEnc);
  try {
    const { status, json } = await ingestFetch({
      dest,
      key,
      method: 'POST',
      path: ingestUnpublishPath(dest.slug, 'go-marketing-ingest-ping'),
    });
    if (status === 401) return { ok: false, message: '金鑰被拒（401）。請向對方確認 X-Go-Marketing-Key。' };
    if (status === 404) return { ok: true, message: '連線成功：金鑰可用，ingest 路徑已通（測試 id 不存在是正常的）。' };
    if (status < 400) return { ok: true, message: '連線成功。' };
    return { ok: false, message: String(json.error || `對方回 ${status}`) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '連線失敗' };
  }
}

export async function saveBrandWebsiteDestination(
  env: Env,
  brandId: string,
  body: {
    blogBaseUrl?: string | null;
    ingestBaseUrl?: string | null;
    ingestKey?: string | null;
  },
): Promise<void> {
  const sql = getSql(env);
  const blog = body.blogBaseUrl === undefined ? undefined : (body.blogBaseUrl?.trim() || null);
  const ingest = body.ingestBaseUrl === undefined ? undefined : (body.ingestBaseUrl?.trim() || null);
  let keyEnc: string | null | undefined;
  if (body.ingestKey !== undefined) {
    keyEnc = body.ingestKey?.trim() ? await encryptToken(env, body.ingestKey.trim()) : null;
  }

  const run = async () => {
    if (blog !== undefined && ingest !== undefined && keyEnc !== undefined) {
      await sql`
        UPDATE brands SET
          blog_base_url = ${blog}, ingest_base_url = ${ingest}, ingest_key_enc = ${keyEnc}, updated_at = now()
        WHERE id = ${brandId}::uuid
      `;
      return;
    }
    if (blog !== undefined && ingest !== undefined) {
      await sql`
        UPDATE brands SET blog_base_url = ${blog}, ingest_base_url = ${ingest}, updated_at = now()
        WHERE id = ${brandId}::uuid
      `;
      return;
    }
    if (blog !== undefined) {
      await sql`UPDATE brands SET blog_base_url = ${blog}, updated_at = now() WHERE id = ${brandId}::uuid`;
    }
    if (ingest !== undefined) {
      await sql`UPDATE brands SET ingest_base_url = ${ingest}, updated_at = now() WHERE id = ${brandId}::uuid`;
    }
    if (keyEnc !== undefined) {
      await sql`UPDATE brands SET ingest_key_enc = ${keyEnc}, updated_at = now() WHERE id = ${brandId}::uuid`;
    }
  };

  try {
    await run();
  } catch (e) {
    if (!isMissingWebsiteArticleSchema(e)) throw e;
    await applyWebsiteArticleMigration(env);
    await run();
  }
}
