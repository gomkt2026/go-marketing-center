import type { Env } from './env';
import { getSql } from './db';

/**
 * 從近 28 天高瀏覽貼文裡數出共鳴詞。
 * 只認這份詞表，不從正文自由切詞，避免把人名或電話變成下一則的題材。
 * 太常出現的泛詞（例如幾乎每篇都有的「媽媽」）會被拿掉；錨點詞保留，因為那是讀者會停下來的場面。
 */
const TERMS = [
  '婆媳', '婆婆', '媳婦', '公婆', '小姑', '妯娌',
  '移工', '外勞', '外籍',
  '家務', '薪水', '房租', '過年', '彩禮',
  '離婚', '結婚', '同居', '分手', '約會', '單身',
  '誰洗碗', '家族群', '生育', '生小孩', '月子', '帶小孩',
  '長輩', '老公', '老婆', '請假', '加班',
] as const;

const ANCHORS = new Set(['婆媳', '婆婆', '媳婦', '公婆', '移工', '外勞', '外籍', '彩禮', '房租']);

export interface ResonantKeyword {
  word: string;
  views: number;
  posts: number;
}

export interface ResonantPost {
  contentId: string;
  title: string;
  body: string;
  views: number;
}

export function scoreResonance(posts: ResonantPost[]): ResonantKeyword[] {
  const ranked = posts.filter((post) => post.views >= 1000);
  if (!ranked.length) return [];
  const buckets = new Map<string, { views: number; ids: Set<string> }>();
  for (const word of TERMS) buckets.set(word, { views: 0, ids: new Set() });

  for (const post of ranked) {
    const text = `${post.title}\n${post.body}`;
    for (const word of TERMS) {
      if (!text.includes(word)) continue;
      const bucket = buckets.get(word)!;
      bucket.views += post.views;
      bucket.ids.add(post.contentId);
    }
  }

  const genericCutoff = Math.max(2, Math.ceil(ranked.length * 0.6));
  return [...buckets.entries()]
    .map(([word, bucket]) => ({ word, views: bucket.views, posts: bucket.ids.size }))
    .filter((item) => item.posts > 0 && item.views >= 3000)
    .filter((item) => ANCHORS.has(item.word) || item.posts < genericCutoff)
    .sort((a, b) => b.views - a.views || b.posts - a.posts)
    .slice(0, 6);
}

export async function loadResonantKeywords(env: Env): Promise<ResonantKeyword[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT
      c.id AS content_id,
      coalesce(c.title, '') AS title,
      left(coalesce(cv.body, ''), 400) AS body,
      coalesce(pr.impressions, 0)::bigint AS views
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    JOIN brands b ON b.id = c.brand_id
    JOIN performance_reports pr ON pr.publishing_job_id = pj.id
    LEFT JOIN content_versions cv ON cv.id = pj.content_version_id
    WHERE pj.status = 'published'
      AND pj.platform IN ('facebook', 'instagram', 'threads')
      AND pj.published_at >= now() - interval '28 days'
      AND b.is_active
      AND lower(b.slug) IN ('taskgo', 'homigo', 'washgo')
      AND pr.impressions >= 1000
    ORDER BY pr.impressions DESC
    LIMIT 80
  `;
  return scoreResonance((rows as Array<Record<string, unknown>>).map((row) => ({
    contentId: String(row.content_id),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    views: Number(row.views ?? 0),
  })));
}

/** 三個帳號同一天各拿不同的高瀏覽詞，避免又寫成同一則。 */
export function focusKeywordFor(keywords: ResonantKeyword[], brandSlug: string, hourTw: number): string | null {
  if (!keywords.length) return null;
  const brand = brandSlug === 'taskgo' ? 0 : brandSlug === 'washgo' ? 2 : 1;
  return keywords[(brand + hourTw) % keywords.length]?.word ?? null;
}
