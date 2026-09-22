import type { Env } from './env';
import { getSql } from './db';
import { SEO_TOPIC_BANK, type SeoTopicSeed } from './prompts';

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
