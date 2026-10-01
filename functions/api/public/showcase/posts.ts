import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { json } from '../../../_shared/response';

export interface ShowcasePost {
  brandSlug: string;
  platform: 'facebook' | 'instagram' | 'threads';
  publishedAt: string | null;
  title: string;
  excerpt: string;
  permalink: string | null;
}

const EXCERPT_LEN = 120;

/** 公開首頁會被任何人看到：電話、Email、LINE ID、網址參數一律遮掉。 */
export function scrubPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '〔已隱藏〕')
    .replace(/(\+?886[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{3}/g, '〔已隱藏〕')
    .replace(/\(?0\d{1,2}\)?[\s-]?\d{3,4}[\s-]?\d{4}/g, '〔已隱藏〕')
    .replace(/(line\s*id|賴|LINE)\s*[:：]\s*@?[\w.-]+/gi, '$1：〔已隱藏〕');
}

function excerpt(body: string): string {
  const flat = scrubPersonal(body).replace(/https?:\/\/\S+/g, '').replace(/#\S+/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_LEN ? `${flat.slice(0, EXCERPT_LEN)}…` : flat;
}

let memo: { exp: number; value: ShowcasePost[] } | null = null;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const headers = { 'Cache-Control': 'public, max-age=300' };
  if (memo && memo.exp > Date.now()) return json({ posts: memo.value }, 200, headers);
  try {
    const sql = getSql(context.env);
    const rows = await sql`
      SELECT DISTINCT ON (b.id)
        b.slug,
        pj.platform,
        pj.published_at,
        coalesce(nullif(c.title, ''), c.generation_prompt_meta->>'theme', '') AS title,
        coalesce(cv.body, '') AS body,
        (
          SELECT lg.detail FROM publishing_logs lg
          WHERE lg.publishing_job_id = pj.id AND lg.event = 'published'
          ORDER BY lg.created_at DESC LIMIT 1
        ) AS permalink
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      JOIN brands b ON b.id = c.brand_id
      LEFT JOIN content_versions cv ON cv.id = pj.content_version_id
      WHERE pj.status = 'published'
        AND pj.platform IN ('facebook', 'instagram', 'threads')
        AND pj.published_at IS NOT NULL
        AND b.is_active
        AND b.slug IN ('taskgo', 'homigo', 'washgo')
      ORDER BY b.id, pj.published_at DESC
    `;
    const posts = (rows as Array<{
      slug: string; platform: ShowcasePost['platform']; published_at: string | null;
      title: string; body: string; permalink: string | null;
    }>).map((r) => ({
      brandSlug: String(r.slug).toLowerCase(),
      platform: r.platform,
      publishedAt: r.published_at,
      title: scrubPersonal(r.title ?? ''),
      excerpt: excerpt(r.body ?? ''),
      permalink: r.permalink && /^https:\/\//i.test(r.permalink) ? r.permalink : null,
    }));
    memo = { exp: Date.now() + 60_000, value: posts };
    return json({ posts }, 200, headers);
  } catch (e) {
    console.error('[showcase/posts]', e);
    return json({ posts: [] }, 200);
  }
};
