import type { Env } from './env';
import { getSql } from './db';
import { getThreadsAccount } from './threads';
import { getMetaAccount } from './meta';
import { getXAccount, refreshXToken } from './x';

const THREADS_API = 'https://graph.threads.net/v1.0';
const GRAPH_API = 'https://graph.facebook.com/v21.0';
const X_API = 'https://api.x.com/2';

/** 單次 HTTP / cron 只處理這麼多篇,避免 Pages Function 子請求上限與逾時變成 500 */
const MAX_JOBS_PER_RUN = 8;

export interface NormalizedMetrics {
  impressions: number;
  clicks: number;
  comments: number;
  shares: number;
  saves: number;
  likes: number;
  engagementRate: number;
  raw: Record<string, unknown>;
}

export interface SyncJobResult {
  jobId: string;
  ok: boolean;
  error?: string;
}

export interface SyncBrandResult {
  brandId: string;
  attempted: number;
  synced: number;
  failed: number;
  skipped: number;
  remaining: number;
  results: SyncJobResult[];
}

interface AccountBundle {
  threads: Awaited<ReturnType<typeof getThreadsAccount>>;
  facebook: Awaited<ReturnType<typeof getMetaAccount>>;
  instagram: Awaited<ReturnType<typeof getMetaAccount>>;
}

interface PublishedJob {
  id: string;
  platform: string;
  externalPostId: string;
  brandId: string;
  collaborationId: string | null;
}

export function computeEngagementRate(m: {
  impressions: number;
  clicks: number;
  comments: number;
  shares: number;
  saves: number;
  likes: number;
}): number {
  if (m.impressions <= 0) return 0;
  const eng = m.clicks + m.comments + m.shares + m.saves + m.likes;
  return Math.min(eng / m.impressions, 9.9999);
}

function insightValue(item: {
  name?: string;
  values?: { value?: number }[];
  total_value?: { value?: number };
}): number {
  if (typeof item.total_value?.value === 'number') return item.total_value.value;
  if (typeof item.values?.[0]?.value === 'number') return item.values[0].value;
  return 0;
}

function mapInsights(data: { name?: string; values?: { value?: number }[]; total_value?: { value?: number } }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of data) {
    if (item.name) out[item.name] = insightValue(item);
  }
  return out;
}

async function fetchJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, data };
}

async function fetchThreadsInsights(account: { accessToken: string }, postId: string): Promise<NormalizedMetrics> {
  const params = new URLSearchParams({
    metric: 'views,likes,replies,reposts,quotes',
    access_token: account.accessToken,
  });
  const insights = await fetchJson(`${THREADS_API}/${encodeURIComponent(postId)}/insights?${params}`);
  if (insights.ok) {
    const mapped = mapInsights((insights.data.data as { name?: string; values?: { value?: number }[]; total_value?: { value?: number } }[]) ?? []);
    const metrics = {
      impressions: mapped.views ?? 0,
      clicks: 0,
      comments: mapped.replies ?? 0,
      shares: mapped.reposts ?? 0,
      saves: 0,
      likes: mapped.likes ?? 0,
    };
    return {
      ...metrics,
      engagementRate: computeEngagementRate(metrics),
      raw: { source: 'threads_insights', quotes: mapped.quotes ?? 0, ...mapped },
    };
  }

  const fields = new URLSearchParams({
    fields: 'like_count,reply_count,repost_count,quote_count,view_count',
    access_token: account.accessToken,
  });
  const media = await fetchJson(`${THREADS_API}/${encodeURIComponent(postId)}?${fields}`);
  if (!media.ok) {
    throw new Error(`Threads 成效回收失敗 (${insights.status}): ${JSON.stringify(insights.data).slice(0, 220)}`);
  }
  const metrics = {
    impressions: Number(media.data.view_count ?? 0),
    clicks: 0,
    comments: Number(media.data.reply_count ?? 0),
    shares: Number(media.data.repost_count ?? 0),
    saves: 0,
    likes: Number(media.data.like_count ?? 0),
  };
  return {
    ...metrics,
    engagementRate: computeEngagementRate(metrics),
    raw: { source: 'threads_media_fields', quotes: Number(media.data.quote_count ?? 0), fallbackFrom: insights.status },
  };
}

async function fetchFacebookInsights(account: { accessToken: string }, postId: string): Promise<NormalizedMetrics> {
  const params = new URLSearchParams({
    metric: 'post_impressions,post_clicks,post_engaged_users',
    access_token: account.accessToken,
  });
  const insights = await fetchJson(`${GRAPH_API}/${encodeURIComponent(postId)}/insights?${params}`);
  const mapped = insights.ok
    ? mapInsights((insights.data.data as { name?: string; values?: { value?: number }[]; total_value?: { value?: number } }[]) ?? [])
    : {};

  const fields = new URLSearchParams({
    fields: 'shares,comments.summary(true),reactions.summary(true)',
    access_token: account.accessToken,
  });
  const post = await fetchJson(`${GRAPH_API}/${encodeURIComponent(postId)}?${fields}`);
  if (!insights.ok && !post.ok) {
    throw new Error(`Facebook 成效回收失敗 (${insights.status}): ${JSON.stringify(insights.data).slice(0, 220)}`);
  }

  const shares = Number((post.data.shares as { count?: number } | undefined)?.count ?? 0);
  const comments = Number((post.data.comments as { summary?: { total_count?: number } } | undefined)?.summary?.total_count ?? 0);
  const likes = Number((post.data.reactions as { summary?: { total_count?: number } } | undefined)?.summary?.total_count ?? 0);
  const metrics = {
    impressions: mapped.post_impressions ?? 0,
    clicks: mapped.post_clicks ?? 0,
    comments,
    shares,
    saves: 0,
    likes,
  };
  return {
    ...metrics,
    engagementRate: computeEngagementRate(metrics),
    raw: { source: 'facebook_insights', engagedUsers: mapped.post_engaged_users ?? 0, ...mapped },
  };
}

async function fetchInstagramInsights(account: { accessToken: string }, mediaId: string): Promise<NormalizedMetrics> {
  const attempts = [
    'views,reach,likes,comments,shares,saved,total_interactions',
    'impressions,reach,likes,comments,shares,saved',
    'impressions,reach,engagement,saved',
  ];
  let mapped: Record<string, number> = {};
  let lastError = '';
  for (const metric of attempts) {
    const params = new URLSearchParams({ metric, access_token: account.accessToken });
    const insights = await fetchJson(`${GRAPH_API}/${encodeURIComponent(mediaId)}/insights?${params}`);
    if (insights.ok) {
      mapped = mapInsights((insights.data.data as { name?: string; values?: { value?: number }[]; total_value?: { value?: number } }[]) ?? []);
      lastError = '';
      break;
    }
    lastError = `IG insights ${insights.status}: ${JSON.stringify(insights.data).slice(0, 180)}`;
  }

  const fields = new URLSearchParams({
    fields: 'like_count,comments_count',
    access_token: account.accessToken,
  });
  const media = await fetchJson(`${GRAPH_API}/${encodeURIComponent(mediaId)}?${fields}`);
  if (!Object.keys(mapped).length && !media.ok) {
    throw new Error(lastError || `Instagram 成效回收失敗`);
  }

  const metrics = {
    impressions: mapped.views ?? mapped.impressions ?? 0,
    clicks: 0,
    comments: mapped.comments ?? Number(media.data.comments_count ?? 0),
    shares: mapped.shares ?? 0,
    saves: mapped.saved ?? 0,
    likes: mapped.likes ?? Number(media.data.like_count ?? 0),
  };
  return {
    ...metrics,
    engagementRate: computeEngagementRate(metrics),
    raw: { source: 'instagram_insights', reach: mapped.reach ?? 0, totalInteractions: mapped.total_interactions ?? mapped.engagement ?? 0, ...mapped },
  };
}

async function fetchXInsights(env: Env, collaborationId: string, tweetId: string): Promise<NormalizedMetrics> {
  const account = await getXAccount(env, collaborationId);
  if (!account) throw new Error('尚未連接 X 帳號');

  const requestTweet = async (token: string) => fetchJson(
    `${X_API}/tweets/${encodeURIComponent(tweetId)}?tweet.fields=public_metrics`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  let res = await requestTweet(account.accessToken);
  if (res.status === 401) {
    const refreshed = await refreshXToken(env, account);
    if (refreshed) res = await requestTweet(refreshed);
  }
  if (!res.ok) {
    throw new Error(`X 成效回收失敗 (${res.status}): ${JSON.stringify(res.data).slice(0, 220)}`);
  }

  const tweet = (res.data.data as { public_metrics?: Record<string, number> } | undefined)?.public_metrics ?? {};
  const metrics = {
    impressions: Number(tweet.impression_count ?? 0),
    clicks: 0,
    comments: Number(tweet.reply_count ?? 0),
    shares: Number(tweet.retweet_count ?? 0),
    saves: Number(tweet.bookmark_count ?? 0),
    likes: Number(tweet.like_count ?? 0),
  };
  return {
    ...metrics,
    engagementRate: computeEngagementRate(metrics),
    raw: { source: 'x_public_metrics', quotes: tweet.quote_count ?? 0, ...tweet },
  };
}

export async function fetchJobInsights(
  env: Env,
  job: PublishedJob,
  accounts?: AccountBundle,
): Promise<NormalizedMetrics> {
  if (job.platform === 'threads') {
    const account = accounts?.threads ?? await getThreadsAccount(env, job.brandId);
    if (!account) throw new Error('尚未連接 Threads 帳號');
    return fetchThreadsInsights(account, job.externalPostId);
  }
  if (job.platform === 'facebook') {
    const account = accounts?.facebook ?? await getMetaAccount(env, job.brandId, 'facebook');
    if (!account) throw new Error('尚未連接 Facebook 帳號');
    return fetchFacebookInsights(account, job.externalPostId);
  }
  if (job.platform === 'instagram') {
    const account = accounts?.instagram ?? await getMetaAccount(env, job.brandId, 'instagram');
    if (!account) throw new Error('尚未連接 Instagram 帳號');
    return fetchInstagramInsights(account, job.externalPostId);
  }
  if (job.platform === 'x') {
    if (!job.collaborationId) throw new Error('X 貼文缺少 collaboration_id');
    return fetchXInsights(env, job.collaborationId, job.externalPostId);
  }
  throw new Error(`平台 ${job.platform} 尚不支援成效回收`);
}

async function loadAccounts(env: Env, brandId: string): Promise<AccountBundle> {
  const [threads, facebook, instagram] = await Promise.all([
    getThreadsAccount(env, brandId),
    getMetaAccount(env, brandId, 'facebook'),
    getMetaAccount(env, brandId, 'instagram'),
  ]);
  return { threads, facebook, instagram };
}

export async function upsertPerformanceReport(env: Env, jobId: string, metrics: NormalizedMetrics): Promise<void> {
  const sql = getSql(env);
  const raw = { ...metrics.raw, likes: metrics.likes };
  await sql`
    INSERT INTO performance_reports (
      publishing_job_id, impressions, clicks, comments, shares, saves, engagement_rate, raw_metrics, captured_at
    ) VALUES (
      ${jobId}::uuid, ${metrics.impressions}, ${metrics.clicks}, ${metrics.comments},
      ${metrics.shares}, ${metrics.saves}, ${metrics.engagementRate}, ${JSON.stringify(raw)}::jsonb, now()
    )
    ON CONFLICT (publishing_job_id) DO UPDATE SET
      impressions = EXCLUDED.impressions,
      clicks = EXCLUDED.clicks,
      comments = EXCLUDED.comments,
      shares = EXCLUDED.shares,
      saves = EXCLUDED.saves,
      engagement_rate = EXCLUDED.engagement_rate,
      raw_metrics = EXCLUDED.raw_metrics,
      captured_at = now()
  `;
}

async function loadPublishedJobs(env: Env, brandId?: string, jobId?: string): Promise<PublishedJob[]> {
  const sql = getSql(env);
  if (jobId) {
    const rows = await sql`
      SELECT pj.id, pj.platform, pj.external_post_id, c.brand_id, c.collaboration_id
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      WHERE pj.id = ${jobId}::uuid AND pj.status = 'published' AND pj.external_post_id IS NOT NULL
      LIMIT 1
    `;
    return (rows as Record<string, unknown>[]).map(mapJob);
  }

  if (brandId) {
    const rows = await sql`
      SELECT pj.id, pj.platform, pj.external_post_id, c.brand_id, c.collaboration_id
      FROM publishing_jobs pj
      JOIN contents c ON c.id = pj.content_id
      LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
      WHERE c.brand_id = ${brandId}::uuid
        AND pj.status = 'published'
        AND pj.external_post_id IS NOT NULL
        AND pj.published_at >= now() - interval '28 days'
      ORDER BY (pr.id IS NULL) DESC, pj.published_at DESC
      LIMIT ${MAX_JOBS_PER_RUN}
    `;
    return (rows as Record<string, unknown>[]).map(mapJob);
  }

  const rows = await sql`
    SELECT pj.id, pj.platform, pj.external_post_id, c.brand_id, c.collaboration_id
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
    WHERE pj.status = 'published'
      AND pj.external_post_id IS NOT NULL
      AND pj.published_at >= now() - interval '28 days'
    ORDER BY (pr.id IS NULL) DESC, pj.published_at DESC
    LIMIT ${MAX_JOBS_PER_RUN}
  `;
  return (rows as Record<string, unknown>[]).map(mapJob);
}

function mapJob(r: Record<string, unknown>): PublishedJob {
  return {
    id: String(r.id),
    platform: String(r.platform),
    externalPostId: String(r.external_post_id),
    brandId: String(r.brand_id),
    collaborationId: r.collaboration_id ? String(r.collaboration_id) : null,
  };
}

async function logInsightEvent(env: Env, jobId: string, event: 'insights_synced' | 'insights_failed', detail: string): Promise<void> {
  const sql = getSql(env);
  try {
    await sql`
      INSERT INTO publishing_logs (publishing_job_id, event, detail)
      VALUES (${jobId}::uuid, ${event}, ${detail})
    `;
  } catch (e) {
    console.error('[insights] 寫入 publishing_logs 失敗', e);
  }
}

async function countRemaining(env: Env, brandId?: string): Promise<number> {
  if (!brandId) return 0;
  const sql = getSql(env);
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    LEFT JOIN performance_reports pr ON pr.publishing_job_id = pj.id
    WHERE c.brand_id = ${brandId}::uuid
      AND pj.status = 'published'
      AND pj.external_post_id IS NOT NULL
      AND pj.published_at >= now() - interval '28 days'
      AND pr.id IS NULL
  `;
  return rows.length ? (rows[0] as { n: number }).n : 0;
}

export async function syncJobs(env: Env, params: { brandId?: string; jobId?: string } = {}): Promise<SyncBrandResult> {
  const jobs = await loadPublishedJobs(env, params.brandId, params.jobId);
  const results: SyncJobResult[] = [];
  let synced = 0;
  let failed = 0;
  const accountsByBrand = new Map<string, AccountBundle>();

  for (const job of jobs) {
    try {
      let accounts = accountsByBrand.get(job.brandId);
      if (!accounts) {
        accounts = await loadAccounts(env, job.brandId);
        accountsByBrand.set(job.brandId, accounts);
      }
      const metrics = await fetchJobInsights(env, job, accounts);
      await upsertPerformanceReport(env, job.id, metrics);
      results.push({ jobId: job.id, ok: true });
      synced += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (params.jobId) await logInsightEvent(env, job.id, 'insights_failed', message.slice(0, 400));
      results.push({ jobId: job.id, ok: false, error: message });
      failed += 1;
    }
  }

  const remaining = await countRemaining(env, params.brandId ?? jobs[0]?.brandId);

  return {
    brandId: params.brandId ?? jobs[0]?.brandId ?? '',
    attempted: jobs.length,
    synced,
    failed,
    skipped: jobs.length ? 0 : 1,
    remaining,
    results,
  };
}

export async function syncPerformanceInsights(env: Env): Promise<SyncBrandResult[]> {
  const sql = getSql(env);
  const brands = await sql`SELECT id FROM brands WHERE is_active = true`;
  const out: SyncBrandResult[] = [];
  for (const row of brands as { id: string }[]) {
    try {
      out.push(await syncJobs(env, { brandId: row.id }));
    } catch (e) {
      console.error('[insights] 品牌同步失敗', row.id, e);
    }
  }
  return out;
}
