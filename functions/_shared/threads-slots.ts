import type { Env } from './env';
import { getSql } from './db';
import {
  buildBrandContext,
  THREADS_HOURLY_CATEGORIES, pickThreadsHourlyCategory, type ThreadsHourlyCategoryId,
} from './prompts';
import {
  generatePlatformPost, generateOfftopicPost, generateThreadsFromImage,
  saveGeneratedContent, findBrandAgent,
} from './generate';
import { getThreadsAccount } from './threads';
import { toPublicMediaUrl } from './media';
import { fetchGoogleTrendsTW } from './sources';
import { logActivity } from './activity';

/** 品牌相關跟風文時段(台灣時間) */
export const THREADS_POST_HOURS_TW: readonly number[] = [0, 6, 12, 18];
/** 生活哏文 / 愛情散文時段(台灣時間) */
export const THREADS_OFFTOPIC_HOURS_TW: readonly number[] = [9, 21];
/** 小編工作台一天 6 檔 */
export const THREADS_DESK_HOURS_TW: readonly number[] = [0, 6, 9, 12, 18, 21];

export const THREADS_SLOT_BRANDS = ['homigo', 'taskgo', 'washgo'] as const;
const OFFTOPIC_BRANDS = ['homigo', 'washgo', 'taskgo'] as const;
const THREADS_DAILY_CAP = 4;
const THREADS_OFFTOPIC_DAILY_CAP = 2;
const THREADS_BRANDS_PER_TICK = 3;

export type ThreadsSlotSource = 'threads_hourly' | 'threads_offtopic';

export interface ThreadsSlotWrite {
  slug: string;
  contentId: string;
  category?: string;
}

export interface ThreadsSlotSkip {
  slug: string;
  reason: string;
}

export interface ThreadsSlotBatchResult {
  generated: ThreadsSlotWrite[];
  skipped: ThreadsSlotSkip[];
}

export function taiwanDayStartUtc(now = new Date()): Date {
  const twMs = now.getTime() + 8 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  return new Date(Math.floor(twMs / dayMs) * dayMs - 8 * 60 * 60 * 1000);
}

export function slotAtToday(hourTW: number, now = new Date()): Date {
  return new Date(taiwanDayStartUtc(now).getTime() + hourTW * 60 * 60 * 1000);
}

export function hourTWFromIso(iso: string): number {
  return (new Date(iso).getUTCHours() + 8) % 24;
}

export function sourceForDeskHour(hourTW: number): ThreadsSlotSource {
  return THREADS_OFFTOPIC_HOURS_TW.includes(hourTW)
    ? 'threads_offtopic'
    : 'threads_hourly';
}

export function slotLabel(source: ThreadsSlotSource, hourTW: number): string {
  if (source === 'threads_hourly') return '熱議跟風';
  return hourTW === 21 ? '愛情散文' : '生活哏文';
}

export async function brandHasSlotContent(
  env: Env,
  brandId: string,
  platform: string,
  source: string,
  slotAt: Date,
  windowMin = 90,
): Promise<boolean> {
  const sql = getSql(env);
  const from = new Date(slotAt.getTime() - windowMin * 60 * 1000).toISOString();
  const to = new Date(slotAt.getTime() + windowMin * 60 * 1000).toISOString();
  const rows = await sql`
    SELECT c.id FROM contents c
    WHERE c.brand_id = ${brandId}::uuid
      AND c.target_platform = ${platform}
      AND c.generation_prompt_meta->>'source' = ${source}
      AND (c.generation_prompt_meta->>'slotAt')::timestamptz
          BETWEEN ${from}::timestamptz AND ${to}::timestamptz
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Threads 跟風檔:一律寫 pending_review,不建 publishing_jobs。
 * auto_publish 改成到期安全網,由 promoteDueThreadsSafetyNet 在 slot 到了才補單。
 */
export async function generateThreadsSlot(
  env: Env,
  slotAt: Date,
  opts?: { slugs?: string[]; ignoreInterval?: boolean; onlyMissing?: boolean },
): Promise<ThreadsSlotBatchResult> {
  const sql = getSql(env);
  const result: ThreadsSlotBatchResult = { generated: [], skipped: [] };
  const trends = await fetchGoogleTrendsTW(8);
  if (!trends.length) {
    console.warn('[threads] Google Trends 為空,改走非時事類型,不略過整檔');
  }

  const brands = await sql`
    SELECT b.id, b.slug, b.name,
           (SELECT max(c.created_at) FROM contents c
            WHERE c.brand_id = b.id AND c.target_platform = 'threads'
              AND c.generation_prompt_meta->>'source' = 'threads_hourly') AS last_at,
           (SELECT count(*)::int FROM contents c
            WHERE c.brand_id = b.id AND c.target_platform = 'threads'
              AND c.generation_prompt_meta->>'source' = 'threads_hourly'
              AND (c.generation_prompt_meta->>'slotAt')::timestamptz >= date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') - interval '8 hours'
              AND (c.generation_prompt_meta->>'slotAt')::timestamptz < date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') + interval '16 hours'
           ) AS today_count,
           (SELECT array_agg(cat) FROM (
              SELECT c.generation_prompt_meta->>'category' AS cat FROM contents c
              WHERE c.brand_id = b.id AND c.target_platform = 'threads'
                AND c.generation_prompt_meta->>'source' = 'threads_hourly'
              ORDER BY c.created_at DESC LIMIT 2
            ) recent) AS recent_categories
    FROM brands b
    WHERE b.is_active = true AND b.slug IN ('homigo', 'taskgo', 'washgo')
    ORDER BY last_at ASC NULLS FIRST
    LIMIT ${opts?.slugs?.length ? 20 : THREADS_BRANDS_PER_TICK}
  `;
  const selected = (brands as {
    id: string; slug: string; name: string; last_at: string | null; today_count: number;
    recent_categories: (string | null)[] | null;
  }[]).filter((b) => !opts?.slugs?.length || opts.slugs.includes(b.slug));

  if (opts?.slugs?.length) {
    for (const slug of opts.slugs) {
      if (!selected.some((b) => b.slug === slug)) {
        result.skipped.push({ slug, reason: '找不到這個品牌' });
      }
    }
  }

  for (const brand of selected) {
    if (await brandHasSlotContent(env, brand.id, 'threads', 'threads_hourly', slotAt)) {
      const reason = '這一檔已經有稿';
      if (opts?.onlyMissing) {
        console.log(`[catchup] ${brand.slug} ${slotAt.toISOString()} Threads 跟風檔已存在,跳過`);
      }
      result.skipped.push({ slug: brand.slug, reason });
      continue;
    }
    if (brand.today_count >= THREADS_DAILY_CAP) {
      result.skipped.push({ slug: brand.slug, reason: `今日跟風文已達 ${THREADS_DAILY_CAP} 篇上限` });
      continue;
    }
    try {
      const brandCtx = await buildBrandContext(env, brand.id);
      const agentId = await findBrandAgent(env, brand.id);
      const trendList = trends.map((t) => t.title).join('、');

      const socialRows = await sql`
        SELECT title FROM market_signals
        WHERE brand_id = ${brand.id}::uuid
          AND source_platform IN ('ptt', 'dcard')
          AND discovered_at > now() - interval '48 hours'
        ORDER BY relevance_score DESC LIMIT 5
      `;
      const socialTopics = (socialRows as { title: string }[]).map((r) => r.title);

      const imageRows = await sql`
        SELECT id, file_url, caption, image_category FROM brand_assets
        WHERE brand_id = ${brand.id}::uuid AND asset_type = 'image'
        ORDER BY used_in_threads_count ASC, last_used_at ASC NULLS FIRST
        LIMIT 1
      `;
      const candidateImage = imageRows.length
        ? imageRows[0] as { id: string; file_url: string | null; caption: string | null; image_category: string | null }
        : null;

      const recentCategoryIds = (brand.recent_categories ?? []).filter((c): c is string => !!c) as ThreadsHourlyCategoryId[];
      const availableCategoryIds = (candidateImage
        ? THREADS_HOURLY_CATEGORIES
        : THREADS_HOURLY_CATEGORIES.filter((c) => c.id !== 'image_inspired')
      ).filter((c) => trends.length > 0 || c.id !== 'seasonal_trend')
        .map((c) => c.id);
      const category = pickThreadsHourlyCategory(recentCategoryIds, availableCategoryIds);

      let post;
      if (category.id === 'image_inspired' && candidateImage) {
        const publicImageUrl = toPublicMediaUrl(env, candidateImage.file_url);
        if (!publicImageUrl) throw new Error('圖片素材缺少可用網址');
        post = await generateThreadsFromImage(env, {
          brandCtx,
          imageUrl: publicImageUrl,
          caption: candidateImage.caption ?? undefined,
          imageCategory: candidateImage.image_category ?? undefined,
          assetId: candidateImage.id,
        });
      } else {
        const trendsBlock = [
          `台灣現在的熱門話題:${trendList}`,
          socialTopics.length
            ? `目前社群(PTT/Dcard)正在討論的行業話題,也可以從這裡取材:\n${socialTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}`
            : '',
        ].filter(Boolean).join('\n\n');
        const topic = category.id === 'seasonal_trend' ? `台灣現在的熱門話題:${trendList}` : `Threads 貼文類型:${category.label}`;
        post = await generatePlatformPost(env, {
          brandCtx,
          platform: 'threads',
          topic,
          extraInstruction: category.instruction.replace('{{TRENDS}}', trendsBlock),
          audienceLane: 'b2c',
        });
      }

      const { contentId } = await saveGeneratedContent(env, {
        brandCtx,
        platform: 'threads',
        result: post,
        generatedByAgentId: agentId,
        status: 'pending_review',
        promptMeta: {
          source: 'threads_hourly', category: category.id, trends: trends.map((t) => t.title), socialTopics,
          slotAt: slotAt.toISOString(),
          audienceLane: 'b2c',
          audienceName: post.audienceName,
          assetId: category.id === 'image_inspired' && candidateImage ? candidateImage.id : undefined,
        },
        imageAssetMeta: category.id === 'image_inspired' && candidateImage
          ? { sourceAssetId: candidateImage.id, generated: false, reused: true }
          : undefined,
      });

      await logActivity(env, {
        brandId: brand.id,
        actorType: 'ai_agent',
        actorAgentId: agentId,
        action: 'content.generated',
        entityType: 'content',
        entityId: contentId,
        afterState: { platform: 'threads', category: category.id, auto: false, scheduled: false, slotAt: slotAt.toISOString() },
      });
      result.generated.push({ slug: brand.slug, contentId, category: category.id });
      console.log(`[threads] ${brand.slug} 已產 ${slotAt.toISOString()} 跟風稿(類型:${category.label},待工作台審核)`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : '生成失敗';
      result.skipped.push({ slug: brand.slug, reason });
      console.error(`[threads] 品牌 ${brand.slug} 生成失敗`, e);
    }
  }
  return result;
}

/**
 * Threads 生活哏文 / 愛情散文:一律 pending_review。
 * 21:00 愛情文不再繞過審核。
 */
export async function generateThreadsOfftopicSlot(
  env: Env,
  slotAt: Date,
  opts?: { slugs?: string[]; onlyMissing?: boolean },
): Promise<ThreadsSlotBatchResult> {
  const sql = getSql(env);
  const result: ThreadsSlotBatchResult = { generated: [], skipped: [] };
  const targetSlugs = opts?.slugs?.length
    ? opts.slugs.filter((s) => (OFFTOPIC_BRANDS as readonly string[]).includes(s))
    : [...OFFTOPIC_BRANDS];

  for (const slug of targetSlugs) {
    try {
      const brandRows = await sql`SELECT id, slug, name FROM brands WHERE slug = ${slug} AND is_active = true LIMIT 1`;
      if (!brandRows.length) {
        result.skipped.push({ slug, reason: '找不到這個品牌' });
        continue;
      }
      const brand = brandRows[0] as { id: string; slug: string; name: string };
      if (await brandHasSlotContent(env, brand.id, 'threads', 'threads_offtopic', slotAt)) {
        if (opts?.onlyMissing) {
          console.log(`[catchup] ${brand.slug} ${slotAt.toISOString()} Threads 生活哏文已存在,跳過`);
        }
        result.skipped.push({ slug: brand.slug, reason: '這一檔已經有稿' });
        continue;
      }

      const todayRows = await sql`
        SELECT count(*)::int AS n FROM contents
        WHERE brand_id = ${brand.id}::uuid
          AND generation_prompt_meta->>'source' = 'threads_offtopic'
          AND (generation_prompt_meta->>'slotAt')::timestamptz >= date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') - interval '8 hours'
          AND (generation_prompt_meta->>'slotAt')::timestamptz < date_trunc('day', ${slotAt.toISOString()}::timestamptz + interval '8 hours') + interval '16 hours'
      `;
      if ((todayRows[0] as { n: number }).n >= THREADS_OFFTOPIC_DAILY_CAP) {
        result.skipped.push({ slug: brand.slug, reason: `今日生活哏文已達 ${THREADS_OFFTOPIC_DAILY_CAP} 篇上限` });
        continue;
      }

      const usedRows = await sql`
        SELECT title, generation_prompt_meta->>'loveAngle' AS angle FROM contents
        WHERE brand_id = ${brand.id}::uuid AND generation_prompt_meta->>'source' = 'threads_offtopic'
          AND created_at > now() - interval '14 days'
        ORDER BY created_at DESC LIMIT 20
      `;
      const usedTopics = (usedRows as { title: string; angle: string | null }[]).map((r) => r.title);
      const usedAngles = (usedRows as { angle: string | null }[])
        .map((r) => r.angle)
        .filter((a): a is string => !!a);
      const hourTW = (slotAt.getUTCHours() + 8) % 24;
      const forceLoveStory = hourTW === 21;

      const agentId = await findBrandAgent(env, brand.id);
      const post = await generateOfftopicPost(env, {
        usedTopics,
        brandSlug: brand.slug,
        forceLoveStory,
        usedAngles,
      });

      const { contentId } = await saveGeneratedContent(env, {
        brandCtx: { brandId: brand.id, slug: brand.slug, name: brand.name, systemPrompt: '' },
        platform: 'threads',
        result: post,
        generatedByAgentId: agentId,
        status: 'pending_review',
        promptMeta: {
          source: 'threads_offtopic',
          category: post.offtopicCategory ?? 'life_gag',
          loveAngle: post.loveAngle,
          slotAt: slotAt.toISOString(),
          audienceLane: 'b2c',
          replyBody: post.post.replyBody || undefined,
        },
      });

      await logActivity(env, {
        brandId: brand.id,
        actorType: 'ai_agent',
        actorAgentId: agentId,
        action: 'content.generated',
        entityType: 'content',
        entityId: contentId,
        afterState: { platform: 'threads', source: 'threads_offtopic', scheduled: false, slotAt: slotAt.toISOString() },
      });
      result.generated.push({
        slug: brand.slug,
        contentId,
        category: post.offtopicCategory ?? (forceLoveStory ? 'love_story' : 'life_gag'),
      });
      console.log(`[offtopic] ${brand.slug} 已產${forceLoveStory ? '愛情散文' : '生活哏文'},${slotAt.toISOString()}(待工作台審核)`);
    } catch (e) {
      const reason = e instanceof Error ? e.message : '生成失敗';
      result.skipped.push({ slug, reason });
      console.error(`[offtopic] 品牌 ${slug} 生成失敗`, e);
    }
  }
  return result;
}

/** 小編在工作台手動產「今天這一檔」 */
export async function generateThreadsDeskSlot(
  env: Env,
  slug: string,
  hourTW: number,
): Promise<ThreadsSlotBatchResult> {
  if (!THREADS_DESK_HOURS_TW.includes(hourTW)) {
    return { generated: [], skipped: [{ slug, reason: `不是 Threads 固定時段(${THREADS_DESK_HOURS_TW.join('/')})` }] };
  }
  const slotAt = slotAtToday(hourTW);
  if (sourceForDeskHour(hourTW) === 'threads_offtopic') {
    return generateThreadsOfftopicSlot(env, slotAt, { slugs: [slug], onlyMissing: true });
  }
  return generateThreadsSlot(env, slotAt, { slugs: [slug], ignoreInterval: true, onlyMissing: true });
}

/**
 * 到期安全網:slot 已到、仍待審、帳號開了 auto_publish → 補建 job,交給 publishDueJobs。
 * 小編已跳過(skipped)的不會補。
 */
export async function promoteDueThreadsSafetyNet(env: Env): Promise<number> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT c.id, c.generation_prompt_meta->>'slotAt' AS slot_at, v.id AS version_id, b.slug
    FROM contents c
    JOIN brands b ON b.id = c.brand_id
    JOIN content_versions v ON v.content_id = c.id
      AND v.version_number = (SELECT max(version_number) FROM content_versions WHERE content_id = c.id)
    JOIN brand_social_accounts acc
      ON acc.brand_id = c.brand_id AND acc.platform = 'threads'
    WHERE c.target_platform = 'threads'
      AND c.status = 'pending_review'
      AND coalesce(c.generation_prompt_meta->>'skipped', 'false') <> 'true'
      AND c.generation_prompt_meta->>'source' IN ('threads_hourly', 'threads_offtopic')
      AND (c.generation_prompt_meta->>'slotAt')::timestamptz <= now()
      AND acc.auto_publish = true
      AND acc.status = 'connected'
      AND c.created_at > now() - interval '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM publishing_jobs pj
        WHERE pj.content_id = c.id AND pj.status IN ('scheduled', 'publishing', 'published')
      )
    LIMIT 10
  `;

  let created = 0;
  for (const row of rows as { id: string; slot_at: string | null; version_id: string; slug: string }[]) {
    await sql`
      INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
      VALUES (${row.id}::uuid, ${row.version_id}::uuid, 'threads', 'scheduled', now())
    `;
    await sql`UPDATE contents SET status = 'scheduled', updated_at = now() WHERE id = ${row.id}::uuid`;
    created += 1;
    console.log(`[threads-safety] ${row.slug} 到期無人審,已自動排入發布`);
  }
  return created;
}
