import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { getSql } from '../../../_shared/db';
import { json } from '../../../_shared/response';

const SLUGS = ['taskgo', 'homigo', 'washgo'] as const;
const PLATFORMS = ['facebook', 'instagram', 'threads'] as const;

type BrandSlug = (typeof SLUGS)[number];
type Platform = (typeof PLATFORMS)[number];

export interface ShowcaseMetric {
  published: number;
  pieces: number;
  measured: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  interactions: number;
}

export interface ShowcaseResults {
  asOf: string;
  since: string | null;
  insightsAt: string | null;
  totals: ShowcaseMetric;
  last28: ShowcaseMetric;
  brands: Array<{
    slug: BrandSlug;
    since: string | null;
    totals: ShowcaseMetric;
    last28: ShowcaseMetric;
  }>;
  platforms: Array<{
    platform: Platform;
    totals: ShowcaseMetric;
    last28: ShowcaseMetric;
  }>;
  weeks: Array<{
    week: string;
    brands: Record<BrandSlug, { published: number; impressions: number; interactions: number }>;
  }>;
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asRows<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T[]; } catch { return []; }
  }
  return [];
}

function blank(): ShowcaseMetric {
  return {
    published: 0, pieces: 0, measured: 0, impressions: 0,
    likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0, interactions: 0,
  };
}

function finish(m: ShowcaseMetric): ShowcaseMetric {
  return { ...m, interactions: m.likes + m.comments + m.shares + m.saves };
}

function addCounts(into: ShowcaseMetric, row: Record<string, unknown>, recent: boolean): void {
  const s = recent ? '_28' : '';
  into.published += num(row[`published${s}`]);
  into.measured += num(row[`measured${s}`]);
  into.impressions += num(row[`impressions${s}`]);
  into.likes += num(row[`likes${s}`]);
  into.comments += num(row[`comments${s}`]);
  into.shares += num(row[`shares${s}`]);
  into.saves += num(row[`saves${s}`]);
  into.clicks += num(row[`clicks${s}`]);
}

interface PlatformRow {
  slug: string;
  platform: string;
  published: number;
  published_28: number;
  measured: number;
  measured_28: number;
  impressions: number;
  impressions_28: number;
  likes: number;
  likes_28: number;
  comments: number;
  comments_28: number;
  shares: number;
  shares_28: number;
  saves: number;
  saves_28: number;
  clicks: number;
  clicks_28: number;
}

interface BrandRow {
  slug: string;
  pieces: number;
  pieces_28: number;
  first_at: string | null;
}

interface WeekRow {
  week: string;
  slug: string;
  published: number;
  impressions: number;
  interactions: number;
}

function dayKey(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value ?? '').slice(0, 10);
}

function emptyWeekBrand() {
  return { published: 0, impressions: 0, interactions: 0 };
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

let memo: { exp: number; value: ShowcaseResults } | null = null;

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const headers = { 'Cache-Control': 'public, max-age=120' };
  if (memo && memo.exp > Date.now()) return json(memo.value, 200, headers);
  try {
    const sql = getSql(context.env);
    const rows = await sql`
      SELECT
        (
          SELECT max(pr.captured_at)
          FROM performance_reports pr
          JOIN publishing_jobs pj ON pj.id = pr.publishing_job_id
          JOIN contents c ON c.id = pj.content_id
          JOIN brands b ON b.id = c.brand_id
          WHERE pj.status = 'published'
            AND pj.platform IN ('facebook', 'instagram', 'threads')
            AND b.is_active
            AND lower(b.slug) IN ('taskgo', 'homigo', 'washgo')
        ) AS insights_at,
        (SELECT COALESCE(json_agg(x), '[]'::json) FROM (
          SELECT
            lower(b.slug) AS slug,
            pj.platform,
            count(*)::int AS published,
            count(*) FILTER (WHERE pj.published_at >= now() - interval '28 days')::int AS published_28,
            count(*) FILTER (WHERE pr.id IS NOT NULL)::int AS measured,
            count(*) FILTER (WHERE pr.id IS NOT NULL AND pj.published_at >= now() - interval '28 days')::int AS measured_28,
            coalesce(sum(pr.impressions), 0)::bigint AS impressions,
            coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::bigint AS impressions_28,
            coalesce(sum(pr.comments), 0)::bigint AS comments,
            coalesce(sum(pr.comments) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::bigint AS comments_28,
            coalesce(sum(pr.shares), 0)::bigint AS shares,
            coalesce(sum(pr.shares) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::bigint AS shares_28,
            coalesce(sum(pr.saves), 0)::bigint AS saves,
            coalesce(sum(pr.saves) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::bigint AS saves_28,
            coalesce(sum(pr.clicks), 0)::bigint AS clicks,
            coalesce(sum(pr.clicks) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::bigint AS clicks_28,
            coalesce(sum(CASE WHEN (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END), 0)::bigint AS likes,
            coalesce(sum(CASE WHEN pj.published_at >= now() - interval '28 days' AND (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END), 0)::bigint AS likes_28
          FROM publishing_jobs pj
          JOIN contents c ON c.id = pj.content_id
          JOIN brands b ON b.id = c.brand_id
          LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
          WHERE pj.status = 'published'
            AND pj.platform IN ('facebook', 'instagram', 'threads')
            AND b.is_active
            AND lower(b.slug) IN ('taskgo', 'homigo', 'washgo')
          GROUP BY lower(b.slug), pj.platform
        ) x) AS by_platform,
        (SELECT COALESCE(json_agg(y), '[]'::json) FROM (
          SELECT
            lower(b.slug) AS slug,
            count(DISTINCT pj.content_id)::int AS pieces,
            count(DISTINCT pj.content_id) FILTER (WHERE pj.published_at >= now() - interval '28 days')::int AS pieces_28,
            min(pj.published_at) AS first_at
          FROM publishing_jobs pj
          JOIN contents c ON c.id = pj.content_id
          JOIN brands b ON b.id = c.brand_id
          WHERE pj.status = 'published'
            AND pj.platform IN ('facebook', 'instagram', 'threads')
            AND b.is_active
            AND lower(b.slug) IN ('taskgo', 'homigo', 'washgo')
          GROUP BY lower(b.slug)
        ) y) AS by_brand,
        (SELECT COALESCE(json_agg(z ORDER BY z.week, z.slug), '[]'::json) FROM (
          SELECT
            w.week,
            s.slug,
            coalesce(p.published, 0)::int AS published,
            coalesce(p.impressions, 0)::bigint AS impressions,
            coalesce(p.interactions, 0)::bigint AS interactions
          FROM (
            SELECT generate_series(
              date_trunc('week', (now() AT TIME ZONE 'Asia/Taipei') - interval '7 weeks')::date,
              date_trunc('week', now() AT TIME ZONE 'Asia/Taipei')::date,
              interval '1 week'
            )::date AS week
          ) w
          CROSS JOIN unnest(ARRAY['taskgo', 'homigo', 'washgo']) AS s(slug)
          LEFT JOIN (
            SELECT
              lower(b.slug) AS slug,
              date_trunc('week', pj.published_at AT TIME ZONE 'Asia/Taipei')::date AS week,
              count(*)::int AS published,
              coalesce(sum(pr.impressions), 0)::bigint AS impressions,
              (
                coalesce(sum(pr.comments), 0)
                + coalesce(sum(pr.shares), 0)
                + coalesce(sum(pr.saves), 0)
                + coalesce(sum(CASE WHEN (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END), 0)
              )::bigint AS interactions
            FROM publishing_jobs pj
            JOIN contents c ON c.id = pj.content_id
            JOIN brands b ON b.id = c.brand_id
            LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
            WHERE pj.status = 'published'
              AND pj.platform IN ('facebook', 'instagram', 'threads')
              AND b.is_active
              AND lower(b.slug) IN ('taskgo', 'homigo', 'washgo')
              AND pj.published_at >= (
                date_trunc('week', (now() AT TIME ZONE 'Asia/Taipei') - interval '7 weeks')
                AT TIME ZONE 'Asia/Taipei'
              )
            GROUP BY 1, 2
          ) p ON p.week = w.week AND p.slug = s.slug
        ) z) AS by_week
    `;
    const bundle = (rows[0] ?? {}) as { by_platform?: unknown; by_brand?: unknown; by_week?: unknown; insights_at?: unknown };
    const platformRows = asRows<PlatformRow>(bundle.by_platform);
    const brandRows = asRows<BrandRow>(bundle.by_brand);
    const weekRows = asRows<WeekRow>(bundle.by_week);

    const totals = blank();
    const last28 = blank();
    const bySlug = new Map<string, { totals: ShowcaseMetric; last28: ShowcaseMetric }>();
    const byPlatform = new Map<string, { totals: ShowcaseMetric; last28: ShowcaseMetric }>();

    for (const slug of SLUGS) bySlug.set(slug, { totals: blank(), last28: blank() });
    for (const platform of PLATFORMS) byPlatform.set(platform, { totals: blank(), last28: blank() });

    for (const row of platformRows) {
      const raw = row as unknown as Record<string, unknown>;
      const brand = bySlug.get(String(row.slug));
      const platform = byPlatform.get(String(row.platform));
      for (const bucket of [brand, platform].filter(Boolean) as Array<{ totals: ShowcaseMetric; last28: ShowcaseMetric }>) {
        addCounts(bucket.totals, raw, false);
        addCounts(bucket.last28, raw, true);
      }
      addCounts(totals, raw, false);
      addCounts(last28, raw, true);
    }

    let since: string | null = null;
    for (const row of brandRows) {
      const brand = bySlug.get(String(row.slug));
      if (!brand) continue;
      brand.totals.pieces = num(row.pieces);
      brand.last28.pieces = num(row.pieces_28);
      totals.pieces += brand.totals.pieces;
      last28.pieces += brand.last28.pieces;
      const first = iso(row.first_at);
      if (first && (!since || first < since)) since = first;
    }

    const weekMap = new Map<string, ShowcaseResults['weeks'][number]>();
    for (const row of weekRows) {
      const key = dayKey(row.week);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      let bucket = weekMap.get(key);
      if (!bucket) {
        bucket = {
          week: key,
          brands: { taskgo: emptyWeekBrand(), homigo: emptyWeekBrand(), washgo: emptyWeekBrand() },
        };
        weekMap.set(key, bucket);
      }
      if (row.slug === 'taskgo' || row.slug === 'homigo' || row.slug === 'washgo') {
        bucket.brands[row.slug] = {
          published: num(row.published),
          impressions: num(row.impressions),
          interactions: num(row.interactions),
        };
      }
    }
    const weeks = [...weekMap.values()].sort((a, b) => a.week.localeCompare(b.week));

    const value: ShowcaseResults = {
      asOf: new Date().toISOString(),
      insightsAt: iso(bundle.insights_at),
      since,
      totals: finish(totals),
      last28: finish(last28),
      brands: SLUGS.map((slug) => {
        const bucket = bySlug.get(slug)!;
        const meta = brandRows.find((r) => String(r.slug) === slug);
        return {
          slug,
          since: iso(meta?.first_at),
          totals: finish(bucket.totals),
          last28: finish(bucket.last28),
        };
      }),
      platforms: PLATFORMS.map((platform) => {
        const bucket = byPlatform.get(platform)!;
        return { platform, totals: finish(bucket.totals), last28: finish(bucket.last28) };
      }),
      weeks,
    };
    memo = { exp: Date.now() + 30_000, value };
    return json(value, 200, headers);
  } catch (e) {
    console.error('[showcase/results]', e);
    return json({ error: '成果暫時無法載入' }, 500);
  }
};
