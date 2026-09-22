import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { toPressCoverage } from '../../../_shared/press';
import { listBrandPostingSlots } from '../../../_shared/posting-slots';
import { slotAtToday } from '../../../_shared/threads-slots';

const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', x: 'X',
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const brandId = brand.id;

  const [
    campaigns, contents, signals, learning, histories, coverages,
    monthJobs, todayJobs, pendingRows, failedRows, perfRows, last28Jobs, todayContents,
  ] = await Promise.all([
    sql`SELECT COUNT(*)::int AS cnt FROM campaigns c JOIN campaign_brands cb ON cb.campaign_id = c.id WHERE cb.brand_id = ${brandId}::uuid AND c.status = 'active'`,
    sql`SELECT COUNT(*)::int AS cnt FROM contents WHERE brand_id = ${brandId}::uuid AND status = 'pending_review'`,
    sql`SELECT COUNT(*)::int AS cnt FROM market_signals WHERE brand_id = ${brandId}::uuid`,
    sql`SELECT COUNT(*)::int AS cnt FROM learning_records WHERE brand_id = ${brandId}::uuid`,
    sql`SELECT id, brand_id, happened_on, title, description FROM brand_histories WHERE brand_id = ${brandId}::uuid ORDER BY happened_on DESC`,
    sql`SELECT * FROM press_coverages WHERE brand_id = ${brandId}::uuid AND status IN ('published', 'syndicated') ORDER BY published_on DESC NULLS LAST LIMIT 3`.catch(() => []),
    sql`
      SELECT
        timezone('Asia/Taipei', coalesce(pj.published_at, pj.scheduled_at, pj.created_at))::date AS day,
        count(*) FILTER (WHERE pj.status = 'published')::int AS published,
        count(*) FILTER (WHERE pj.status = 'failed')::int AS failed
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE c.brand_id = ${brandId}::uuid
        AND coalesce(pj.published_at, pj.scheduled_at, pj.created_at)
            >= date_trunc('month', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'
      GROUP BY 1
      ORDER BY 1
    `,
    sql`
      SELECT
        count(*) FILTER (WHERE pj.status = 'published')::int AS published,
        count(*) FILTER (WHERE pj.status = 'scheduled')::int AS scheduled,
        count(*) FILTER (WHERE pj.status = 'failed')::int AS failed
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE c.brand_id = ${brandId}::uuid
        AND timezone('Asia/Taipei', coalesce(pj.published_at, pj.scheduled_at, pj.created_at))::date
            = timezone('Asia/Taipei', now())::date
    `,
    sql`
      SELECT id, title, target_platform, status, updated_at
      FROM contents
      WHERE brand_id = ${brandId}::uuid AND status = 'pending_review'
      ORDER BY updated_at DESC LIMIT 8
    `,
    sql`
      SELECT pj.id, c.title, pj.platform, pj.scheduled_at, lg.detail AS last_log_detail
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN LATERAL (
        SELECT detail FROM publishing_logs WHERE publishing_job_id = pj.id ORDER BY created_at DESC LIMIT 1
      ) lg ON true
      WHERE c.brand_id = ${brandId}::uuid AND pj.status = 'failed'
      ORDER BY pj.updated_at DESC LIMIT 6
    `,
    sql`
      SELECT pj.platform,
             coalesce(sum(pr.impressions), 0)::int AS impressions,
             coalesce(sum(pr.comments), 0)::int AS comments,
             coalesce(sum(CASE WHEN (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::int ELSE 0 END), 0)::int AS likes
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
      WHERE c.brand_id = ${brandId}::uuid
        AND pj.status = 'published'
        AND pj.published_at >= date_trunc('month', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'
      GROUP BY pj.platform
    `,
    sql`
      SELECT
        coalesce(sum(pr.impressions), 0)::int AS impressions,
        coalesce(sum(pr.clicks), 0)::int AS clicks,
        coalesce(sum(pr.comments), 0)::int AS comments,
        coalesce(sum(pr.shares), 0)::int AS shares,
        coalesce(sum(pr.saves), 0)::int AS saves,
        coalesce(sum(CASE WHEN (pr.raw_metrics->>'likes') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::int ELSE 0 END), 0)::int AS likes
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
      WHERE c.brand_id = ${brandId}::uuid
        AND pj.status = 'published'
        AND pj.published_at >= now() - interval '28 days'
    `,
    sql`
      SELECT c.target_platform AS platform, c.generation_prompt_meta->>'slotAt' AS slot_at, c.status
      FROM contents c
      WHERE c.brand_id = ${brandId}::uuid
        AND (c.generation_prompt_meta->>'slotAt')::timestamptz
            >= date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei'
        AND (c.generation_prompt_meta->>'slotAt')::timestamptz
            < date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei' + interval '1 day'
    `,
  ]);

  const slots = await listBrandPostingSlots(context.env, brandId);
  const enabledSlots = slots.filter((s) => s.enabled);
  const filledKeys = new Set(
    (todayContents as { platform: string; slot_at: string | null; status: string }[])
      .filter((r) => r.slot_at && r.status !== 'rejected' && r.status !== 'archived')
      .map((r) => {
        const hour = (new Date(r.slot_at as string).getUTCHours() + 8) % 24;
        return `${r.platform}|${hour}`;
      }),
  );
  const expected = enabledSlots.length;
  const filled = enabledSlots.filter((s) => filledKeys.has(`${s.platform}|${s.hourTw}`)).length;

  const monthMap = new Map<string, { published: number; failed: number }>();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const today = new Date();
  for (let d = new Date(monthStart); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    monthMap.set(key, { published: 0, failed: 0 });
  }
  for (const row of monthJobs as { day: string; published: number; failed: number }[]) {
    const key = String(row.day).slice(0, 10);
    monthMap.set(key, { published: Number(row.published), failed: Number(row.failed) });
  }
  const monthDaily = [...monthMap.entries()].map(([date, v]) => ({
    label: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`,
    date,
    published: v.published,
    failed: v.failed,
  }));
  const publishedMonth = monthDaily.reduce((n, r) => n + r.published, 0);
  const failedMonth = monthDaily.reduce((n, r) => n + r.failed, 0);
  const todayRow = (todayJobs[0] as { published: number; scheduled: number; failed: number } | undefined) ?? {
    published: 0, scheduled: 0, failed: 0,
  };
  const pendingCount = (contents[0] as { cnt: number }).cnt;
  const last28 = (last28Jobs[0] as Record<string, number>) ?? {
    impressions: 0, clicks: 0, comments: 0, shares: 0, saves: 0, likes: 0,
  };

  return json({
    stats: {
      activeCampaigns: (campaigns[0] as { cnt: number }).cnt,
      pendingContents: pendingCount,
      marketSignals: (signals[0] as { cnt: number }).cnt,
      learningRecords: (learning[0] as { cnt: number }).cnt,
      publishedMonth,
      failedMonth,
      successRate: (publishedMonth + failedMonth) > 0 ? publishedMonth / (publishedMonth + failedMonth) : 0,
      scheduledToday: Number(todayRow.scheduled),
      publishedToday: Number(todayRow.published),
      failedToday: Number(todayRow.failed),
    },
    monthDaily,
    platformEngagement: (perfRows as { platform: string; impressions: number; comments: number; likes: number }[]).map((r) => ({
      platform: PLATFORM_LABEL[r.platform] ?? r.platform,
      impressions: Number(r.impressions),
      comments: Number(r.comments),
      likes: Number(r.likes),
    })),
    monthOutcome: { published: publishedMonth, failed: failedMonth },
    todayPipeline: {
      published: Number(todayRow.published),
      scheduled: Number(todayRow.scheduled),
      pending: pendingCount,
      failed: Number(todayRow.failed),
    },
    last28: {
      impressions: Number(last28.impressions ?? 0),
      clicks: Number(last28.clicks ?? 0),
      comments: Number(last28.comments ?? 0),
      shares: Number(last28.shares ?? 0),
      saves: Number(last28.saves ?? 0),
      likes: Number(last28.likes ?? 0),
    },
    slotCoverage: {
      expected,
      filled,
      percent: expected > 0 ? filled / expected : 0,
      nextSlot: enabledSlots
        .map((s) => ({ ...s, at: slotAtToday(s.hourTw) }))
        .filter((s) => s.at.getTime() > Date.now())
        .sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null,
    },
    pendingItems: (pendingRows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      title: r.title,
      platform: r.target_platform,
      updatedAt: r.updated_at,
    })),
    failedItems: (failedRows as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      title: r.title,
      platform: r.platform,
      scheduledAt: r.scheduled_at,
      lastLogDetail: r.last_log_detail,
    })),
    histories: (histories as Record<string, unknown>[]).map((h) => ({
      id: h.id,
      brandId: h.brand_id,
      happenedOn: h.happened_on,
      title: h.title,
      description: h.description,
    })),
    pressCoverages: (coverages as Record<string, unknown>[]).map(toPressCoverage),
  });
};
