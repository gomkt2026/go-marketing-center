import type { Env } from './env';
import { getSql } from './db';
import { rowToCamel } from './case';

export type PressCoverageStatus = 'inbox' | 'published' | 'syndicated' | 'dismissed';
export type PressReleaseStatus = 'draft' | 'pending_review' | 'approved' | 'final';

export interface PressCoverageRow {
  id: string;
  brandId: string;
  pressReleaseId: string | null;
  storyKey: string;
  outlet: string;
  headline: string;
  articleUrl: string | null;
  publishedOn: string | null;
  status: PressCoverageStatus;
  discoverySource: 'manual' | 'scheduler';
  summary: string | null;
  keyQuotes: string[];
  claimableFacts: string[];
  isPrimary: boolean;
  relatedBrandSlugs: string[];
}

export function toPressCoverage(row: Record<string, unknown>): PressCoverageRow {
  const camel = rowToCamel<Record<string, unknown>>(row);
  return {
    ...camel,
    keyQuotes: Array.isArray(camel.keyQuotes) ? camel.keyQuotes as string[] : [],
    claimableFacts: Array.isArray(camel.claimableFacts) ? camel.claimableFacts as string[] : [],
    relatedBrandSlugs: Array.isArray(camel.relatedBrandSlugs) ? camel.relatedBrandSlugs as string[] : [],
  } as PressCoverageRow;
}

export function coverageTopicSummary(c: {
  outlet: string;
  headline: string;
  articleUrl: string | null;
  summary: string | null;
  keyQuotes: string[];
  claimableFacts: string[];
}): string {
  const quotes = c.keyQuotes.length ? `金句:${c.keyQuotes.slice(0, 2).join(' / ')}` : '';
  const facts = c.claimableFacts.length ? `可引用事實:${c.claimableFacts.join('、')}` : '';
  return [
    `${c.outlet}《${c.headline}》`,
    c.summary ?? '',
    quotes,
    facts,
    c.articleUrl ? `原文:${c.articleUrl}` : '',
  ].filter(Boolean).join('\n');
}

export function publishedCoveragePrompt(items: PressCoverageRow[]): string {
  if (!items.length) return '';
  const lines = items.map((c) => {
    const quotes = c.keyQuotes.length ? `；金句「${c.keyQuotes[0]}」` : '';
    const facts = c.claimableFacts.length ? `：可引用${c.claimableFacts.slice(0, 4).join('、')}` : '';
    const date = c.publishedOn ? String(c.publishedOn).slice(0, 10) : '';
    return `- ${date} ${c.outlet}《${c.headline}》${facts}${quotes}`;
  });
  return [
    '已驗證媒體報導(僅可引用下列出處與事實,不可自行發明媒體名稱或誇大轉載):',
    ...lines,
    '沒有列在上面的媒體名稱、專訪、轉載數量一律不准寫。不可把轉載當成多次獨立專訪。',
  ].join('\n');
}

export async function loadPublishedPrimaryCoverages(env: Env, brandId: string, limit = 4): Promise<PressCoverageRow[]> {
  const sql = getSql(env);
  try {
    const rows = await sql`
      SELECT * FROM press_coverages
      WHERE brand_id = ${brandId}::uuid AND status = 'published' AND is_primary = true
      ORDER BY published_on DESC NULLS LAST, created_at DESC
      LIMIT ${limit}
    `;
    return (rows as Record<string, unknown>[]).map(toPressCoverage);
  } catch {
    return [];
  }
}

export function slugifyStoryKey(input: string): string {
  const ascii = input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return ascii || `story-${Date.now()}`;
}
