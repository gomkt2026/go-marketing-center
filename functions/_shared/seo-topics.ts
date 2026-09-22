import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { SEO_TOPIC_BANK, type SeoTopicSeed } from './prompts';
import { defaultWebsiteDestination } from './website-articles';

/** 一次只推這幾篇新長文，避免主題庫全部變成「產生這篇長文」 */
export const MAX_RECOMMENDED_SEO_ARTICLES = 3;

export type SeoTopicCoverage = 'open' | 'draft' | 'published';

export interface SeoTopicWithCoverage extends SeoTopicSeed {
  coverage: SeoTopicCoverage;
  matchedTitle?: string;
}

function isMissingSeoTopics(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?brand_seo_topics["']? does not exist/i.test(msg);
}

export async function ensureSeoTopicsTable(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`
    CREATE TABLE IF NOT EXISTS brand_seo_topics (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      topic           TEXT NOT NULL,
      angle           TEXT NOT NULL,
      primary_keyword TEXT,
      related_terms   JSONB NOT NULL DEFAULT '[]',
      category        TEXT,
      search_intent   TEXT,
      audience        TEXT,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_brand_seo_topics_brand ON brand_seo_topics(brand_id)`;
}

function mapTopicRow(row: Record<string, unknown>): SeoTopicSeed {
  const related = Array.isArray(row.related_terms) ? row.related_terms.map(String) : [];
  return {
    topic: String(row.topic),
    angle: String(row.angle),
    primaryKeyword: row.primary_keyword ? String(row.primary_keyword) : undefined,
    relatedTerms: related,
    category: (row.category as SeoTopicSeed['category']) || undefined,
    searchIntent: (row.search_intent as SeoTopicSeed['searchIntent']) || undefined,
    audience: (row.audience as SeoTopicSeed['audience']) || undefined,
  };
}

export async function listStoredSeoTopics(env: Env, brandId: string): Promise<SeoTopicSeed[]> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT topic, angle, primary_keyword, related_terms, category, search_intent, audience
      FROM brand_seo_topics
      WHERE brand_id = ${brandId}::uuid
      ORDER BY sort_order, created_at
    `;
    return (rows as Record<string, unknown>[]).map(mapTopicRow);
  } catch (e) {
    if (!isMissingSeoTopics(e)) throw e;
    try {
      await ensureSeoTopicsTable(env);
      return listStoredSeoTopics(env, brandId);
    } catch {
      return [];
    }
  }
}

export async function listSeoTopicsForBrand(
  env: Env,
  brandId: string,
  slug: string,
): Promise<SeoTopicSeed[]> {
  const stored = await listStoredSeoTopics(env, brandId);
  if (stored.length) return stored;
  return SEO_TOPIC_BANK[slug] ?? [];
}

function compact(text: string): string {
  return text.replace(/\s+/g, '').replace(/[？?！!，,。、：:；;]/g, '');
}

function topicNeedles(topic: SeoTopicSeed): string[] {
  const raw = [
    topic.primaryKeyword,
    topic.topic.replace(/[？?].*$/, ''),
    ...(topic.relatedTerms ?? []).slice(0, 1),
  ].filter((item): item is string => !!item && compact(item).length >= 4);
  return [...new Set(raw.map(compact))];
}

export function findCoveringTitle(topic: SeoTopicSeed, titles: string[]): string | undefined {
  const needles = topicNeedles(topic);
  if (!needles.length) return undefined;
  for (const title of titles) {
    const hay = compact(title);
    if (!hay) continue;
    if (needles.some((needle) => hay.includes(needle))) return title;
  }
  return undefined;
}

export async function loadSeoContentTitles(env: Env, brandId: string): Promise<{
  published: string[];
  drafts: string[];
}> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT c.title, c.status, v.seo_meta
      FROM contents c
      JOIN LATERAL (
        SELECT seo_meta
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
    const published: string[] = [];
    const drafts: string[] = [];
    for (const row of rows as { title: string; status: string; seo_meta: Record<string, unknown> | null }[]) {
      const seo = row.seo_meta ?? {};
      const label = [row.title, seo.primary_keyword, seo.seo_title].filter(Boolean).join(' ');
      if (row.status === 'published' || row.status === 'scheduled') published.push(label);
      else if (row.status === 'pending_review' || row.status === 'approved') drafts.push(label);
    }
    return { published, drafts };
  } catch {
    return { published: [], drafts: [] };
  }
}

export function classifySeoTopics(
  topics: SeoTopicSeed[],
  coverage: { published: string[]; drafts: string[]; extraTitles?: string[] },
): SeoTopicWithCoverage[] {
  const siteTitles = coverage.extraTitles ?? [];
  return topics.map((topic) => {
    const publishedHit = findCoveringTitle(topic, coverage.published);
    if (publishedHit) return { ...topic, coverage: 'published', matchedTitle: publishedHit };
    const siteHit = findCoveringTitle(topic, siteTitles);
    if (siteHit) return { ...topic, coverage: 'published', matchedTitle: siteHit };
    const draftHit = findCoveringTitle(topic, coverage.drafts);
    if (draftHit) return { ...topic, coverage: 'draft', matchedTitle: draftHit };
    return { ...topic, coverage: 'open' };
  });
}

export async function annotateSeoTopics(
  env: Env,
  brandId: string,
  topics: SeoTopicSeed[],
): Promise<SeoTopicWithCoverage[]> {
  const coverage = await loadSeoContentTitles(env, brandId);
  return classifySeoTopics(topics, coverage);
}

export function recommendedSeoTopics(topics: SeoTopicWithCoverage[]): SeoTopicWithCoverage[] {
  return topics.filter((topic) => topic.coverage === 'open').slice(0, MAX_RECOMMENDED_SEO_ARTICLES);
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'GoMarketing-SEO-Discover/1.0',
      },
      signal: AbortSignal.timeout(8_000),
    });
    return (await res.text()).slice(0, 200_000);
  } catch {
    return '';
  }
}

function sitemapLocs(xml: string, limit = 12): string[] {
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

function htmlTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = match?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return title || fallback;
}

export async function crawlSiteArticleTitles(siteUrl: string): Promise<string[]> {
  const origin = siteUrl.replace(/\/$/, '');
  const titles: string[] = [];
  const sitemap = await fetchText(`${origin}/sitemap.xml`);
  const blogUrls = sitemapLocs(sitemap, 12).filter((loc) => /blog|article|knowledge|guide/i.test(loc)).slice(0, 4);
  const blogIndex = await fetchText(`${origin}/blog`);
  if (blogIndex) titles.push(htmlTitle(blogIndex, 'blog'));
  const pages = await Promise.all(blogUrls.map((url) => fetchText(url).then((html) => htmlTitle(html, url))));
  titles.push(...pages.filter(Boolean));
  return [...new Set(titles)];
}

function topicKey(topic: SeoTopicSeed): string {
  return compact(topic.primaryKeyword || topic.topic);
}

export async function discoverNewSeoTopics(
  env: Env,
  brand: { id: string; slug: string; name: string; blogBaseUrl?: string | null; websiteUrl?: string | null },
): Promise<{
  topics: SeoTopicWithCoverage[];
  discovered: SeoTopicSeed[];
  siteTitles: string[];
}> {
  const current = await listSeoTopicsForBrand(env, brand.id, brand.slug);
  const content = await loadSeoContentTitles(env, brand.id);
  const siteUrl = (brand.blogBaseUrl || defaultWebsiteDestination(brand.slug)?.blogBaseUrl || brand.websiteUrl || '').replace(/\/$/, '');
  const siteTitles = siteUrl ? await crawlSiteArticleTitles(siteUrl) : [];
  const classified = classifySeoTopics(current, {
    published: content.published,
    drafts: content.drafts,
    extraTitles: siteTitles,
  });
  const existingKeys = new Set(classified.map(topicKey));
  const existingTitles = [...content.published, ...content.drafts, ...siteTitles, ...classified.map((t) => t.topic)];

  let discovered: SeoTopicSeed[] = [];
  try {
    const result = await chatCompleteJson<{ topics: SeoTopicSeed[] }>(env, {
      messages: [
        {
          role: 'system',
          content: '你是台灣生活服務／B2B 的 SEO 企劃。先看已經有的文章，只出還沒被覆蓋的新搜尋題。不可發明客戶數、市佔或保證成效。',
        },
        {
          role: 'user',
          content: [
            `品牌:${brand.name}（${brand.slug}）`,
            `已有長文或草稿:\n${existingTitles.slice(0, 40).map((t) => `- ${t}`).join('\n') || '- （尚無）'}`,
            `現有題庫:\n${current.map((t) => `- ${t.topic}／${t.primaryKeyword || ''}`).join('\n')}`,
            `請只產出最多 ${MAX_RECOMMENDED_SEO_ARTICLES} 個「新的」搜尋題，必須跟上面題目與長文明顯不同。`,
            '優先台灣人會搜的痛點問句，不要再寫同一組收租／派工／洗衣系統說明。',
            '回傳 JSON:{"topics":[{"topic":"中文題目","angle":"寫作角度40-80字","primaryKeyword":"主關鍵字","relatedTerms":["相關詞"],"category":"pain|product|policy|trust|talk","searchIntent":"informational|solution","audience":"consumer|merchant"}]}',
          ].join('\n'),
        },
      ],
      temperature: 0.4,
      maxTokens: 1400,
    });
    discovered = (result.topics ?? [])
      .filter((t) => t.topic && t.angle)
      .filter((t) => !existingKeys.has(topicKey(t)) && !findCoveringTitle(t, existingTitles))
      .slice(0, MAX_RECOMMENDED_SEO_ARTICLES);
  } catch (err) {
    console.error('[seo] discover topics failed', err);
  }

  if (discovered.length) {
    await replaceBrandSeoTopics(env, brand.id, [...discovered, ...current]);
  }

  const next = discovered.length ? [...discovered, ...current] : current;
  const topics = classifySeoTopics(next, {
    published: content.published,
    drafts: content.drafts,
    extraTitles: siteTitles,
  });
  return { topics, discovered, siteTitles };
}

export async function replaceBrandSeoTopics(
  env: Env,
  brandId: string,
  topics: SeoTopicSeed[],
): Promise<void> {
  await ensureSeoTopicsTable(env);
  const sql = getSql(env);
  await sql`DELETE FROM brand_seo_topics WHERE brand_id = ${brandId}::uuid`;
  if (!topics.length) return;
  const topicTexts = topics.map((t) => t.topic);
  const angles = topics.map((t) => t.angle);
  const keywords = topics.map((t) => t.primaryKeyword ?? t.topic);
  const related = topics.map((t) => JSON.stringify(t.relatedTerms ?? []));
  const categories = topics.map((t) => t.category ?? 'talk');
  const intents = topics.map((t) => t.searchIntent ?? 'informational');
  const audiences = topics.map((t) => t.audience ?? null);
  const orders = topics.map((_, i) => i);
  await sql`
    INSERT INTO brand_seo_topics (
      brand_id, topic, angle, primary_keyword, related_terms, category, search_intent, audience, sort_order
    )
    SELECT ${brandId}::uuid, t.topic, t.angle, t.keyword, t.related::jsonb, t.category, t.intent, t.audience, t.sort_order
    FROM unnest(
      ${topicTexts}::text[],
      ${angles}::text[],
      ${keywords}::text[],
      ${related}::text[],
      ${categories}::text[],
      ${intents}::text[],
      ${audiences}::text[],
      ${orders}::int[]
    ) AS t(topic, angle, keyword, related, category, intent, audience, sort_order)
  `;
}

export function fallbackSeoTopics(name: string, industry: string): SeoTopicSeed[] {
  const focus = industry.trim() || name;
  return [
    {
      topic: `${name} 是做什麼的？給第一次接觸的人`,
      angle: `對準「${name} 是什麼」。用產業現場痛點解釋產品做什麼、不做什麼。不可發明客戶數或保證成效。`,
      primaryKeyword: name,
      relatedTerms: [focus, '怎麼用', '適合誰', '流程', '痛點', '台灣'],
      category: 'product',
      searchIntent: 'informational',
    },
    {
      topic: `${focus}怎麼選？現場最常踩的坑`,
      angle: `對準會搜「${focus}怎麼選」的人。用具體場景對照，不要寫成長文廣告。`,
      primaryKeyword: `${focus}怎麼選`,
      relatedTerms: [focus, '比較', '檢查表', '導入', '成本', '流程'],
      category: 'pain',
      searchIntent: 'solution',
    },
    {
      topic: `${focus}日常怎麼少靠 LINE 群考古`,
      angle: `對準第一線溝通散落在 LINE、Excel 的人。講紀錄回流同一個地方，不保證省多少時間。`,
      primaryKeyword: `${focus}管理`,
      relatedTerms: ['LINE', 'Excel', '紀錄', '對帳', '進度', '通知'],
      category: 'talk',
      searchIntent: 'solution',
    },
    {
      topic: `第一次用 ${name} 要準備什麼`,
      angle: `對準「怎麼開始」。寫可核實的步驟，不要下載 App 神話或保證成功。`,
      primaryKeyword: `${name} 怎麼開始`,
      relatedTerms: ['開始使用', '設定', '帳號', '流程', '注意事項'],
      category: 'product',
      searchIntent: 'informational',
    },
  ];
}
