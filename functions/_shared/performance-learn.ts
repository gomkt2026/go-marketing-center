import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';

const MIN_SYNCED_POSTS = 3;
const LOOKBACK_DAYS = 28;
const DEDUPE_DAYS = 7;

const VALID_TYPES = ['content_performance', 'cta_effectiveness', 'audience_engagement', 'channel_insight'] as const;
type LearningType = typeof VALID_TYPES[number];

interface PostSnapshot {
  contentId: string;
  title: string;
  platform: string;
  genSource: string | null;
  bodyPreview: string;
  cta: string | null;
  predictedScore: number | null;
  impressions: number;
  comments: number;
  shares: number;
  saves: number;
  likes: number;
  engagementRate: number;
}

interface AiInsight {
  recordType?: string;
  insight?: string;
  relatedContentId?: string;
  doMore?: string[];
  doLess?: string[];
  winningHooks?: string[];
  weakCta?: string[];
  platform?: string;
  genSource?: string;
}

export interface AnalyzeBrandResult {
  brandId: string;
  created: number;
  skipped: string | null;
}

async function findAnalystAgent(env: Env, brandId: string): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE a.is_active = true AND r.code IN ('content_strategist', 'brand_ai')
    ORDER BY (r.code = 'content_strategist') DESC, (a.brand_id = ${brandId}::uuid) DESC
    LIMIT 1
  `;
  return rows.length ? (rows[0] as { id: string }).id : null;
}

async function loadSyncedPosts(env: Env, brandId: string): Promise<PostSnapshot[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT
      c.id AS content_id,
      c.title,
      pj.platform,
      c.generation_prompt_meta->>'source' AS gen_source,
      LEFT(COALESCE(cv.body, ''), 180) AS body_preview,
      cv.cta,
      c.predicted_engagement_score,
      pr.impressions, pr.comments, pr.shares, pr.saves, pr.engagement_rate,
      COALESCE((pr.raw_metrics->>'likes')::bigint, 0) AS likes
    FROM publishing_jobs pj
    JOIN contents c ON c.id = pj.content_id
    JOIN performance_reports pr ON pr.publishing_job_id = pj.id
    LEFT JOIN LATERAL (
      SELECT body, cta FROM content_versions
      WHERE content_id = c.id
      ORDER BY version_number DESC
      LIMIT 1
    ) cv ON true
    WHERE c.brand_id = ${brandId}::uuid
      AND pj.status = 'published'
      AND pj.published_at >= now() - interval '28 days'
    ORDER BY pr.engagement_rate DESC NULLS LAST
    LIMIT 24
  `;
  return (rows as Record<string, unknown>[]).map((r) => ({
    contentId: String(r.content_id),
    title: String(r.title ?? ''),
    platform: String(r.platform),
    genSource: r.gen_source ? String(r.gen_source) : null,
    bodyPreview: String(r.body_preview ?? ''),
    cta: r.cta ? String(r.cta) : null,
    predictedScore: r.predicted_engagement_score != null ? Number(r.predicted_engagement_score) : null,
    impressions: Number(r.impressions ?? 0),
    comments: Number(r.comments ?? 0),
    shares: Number(r.shares ?? 0),
    saves: Number(r.saves ?? 0),
    likes: Number(r.likes ?? 0),
    engagementRate: Number(r.engagement_rate ?? 0),
  }));
}

function compactPosts(posts: PostSnapshot[]): string {
  return posts.map((p, i) => {
    const rank = i === 0 ? 'TOP' : i >= posts.length - 2 ? 'BOTTOM' : 'MID';
    return [
      `[${rank}] ${p.title || '(無標題)'}`,
      `id=${p.contentId} 平台=${p.platform} 來源=${p.genSource ?? '-'} 預測分=${p.predictedScore ?? '-'}`,
      `曝光=${p.impressions} 留言=${p.comments} 分享=${p.shares} 收藏=${p.saves} 按讚=${p.likes} 互動率=${(p.engagementRate * 100).toFixed(2)}%`,
      p.cta ? `CTA:${p.cta}` : '',
      p.bodyPreview ? `開頭:${p.bodyPreview}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

export async function analyzeBrandPerformance(env: Env, brandId: string): Promise<AnalyzeBrandResult> {
  const sql = getSql(env);
  const posts = await loadSyncedPosts(env, brandId);
  if (posts.length < MIN_SYNCED_POSTS) {
    return { brandId, created: 0, skipped: `已同步貼文不足 ${MIN_SYNCED_POSTS} 篇` };
  }

  const recent = await sql`
    SELECT record_type FROM learning_records
    WHERE brand_id = ${brandId}::uuid
      AND status = 'pending_review'
      AND created_at >= now() - interval '7 days'
  `;
  const blocked = new Set((recent as { record_type: string }[]).map((r) => r.record_type));

  const brandRows = await sql`SELECT name, slug FROM brands WHERE id = ${brandId}::uuid LIMIT 1`;
  const brand = brandRows[0] as { name: string; slug: string } | undefined;
  if (!brand) return { brandId, created: 0, skipped: '找不到品牌' };

  const result = await chatCompleteJson<{ insights?: AiInsight[] }>(env, {
    temperature: 0.4,
    maxTokens: 1600,
    messages: [
      {
        role: 'system',
        content: [
          '你是台灣社群操盤手,根據真實發文成效產出可執行的學習洞察。',
          '禁止空話(例如「加強互動」「優化內容」);每條必須指出具體模式,並告訴下次發文要多做或少做什麼。',
          '不可改寫品牌定位、不可發明沒出現在資料裡的數字。',
          '回傳 JSON:{"insights":[{"recordType":"content_performance|cta_effectiveness|audience_engagement|channel_insight","insight":"繁中一句到三段可執行結論","relatedContentId":"對應貼文 id 或空","doMore":["..."],"doLess":["..."],"winningHooks":["..."],"weakCta":["..."],"platform":"threads|facebook|instagram|x","genSource":"來源字串"}]}',
          '最多 4 條,每種 recordType 最多 1 條。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `品牌:${brand.name}(${brand.slug})\n近 ${LOOKBACK_DAYS} 天已同步貼文(依互動率排序):\n\n${compactPosts(posts)}`,
      },
    ],
  });

  const agentId = await findAnalystAgent(env, brandId);
  const contentIds = new Set(posts.map((p) => p.contentId));
  let created = 0;

  for (const item of (result.insights ?? []).slice(0, 4)) {
    const recordType = VALID_TYPES.includes(item.recordType as LearningType) ? item.recordType as LearningType : 'content_performance';
    if (blocked.has(recordType)) continue;
    const insight = item.insight?.trim();
    if (!insight) continue;

    const related = item.relatedContentId && contentIds.has(item.relatedContentId) ? item.relatedContentId : posts[0]?.contentId ?? null;
    const supporting = {
      source: 'performance_learn',
      do_more: item.doMore ?? [],
      do_less: item.doLess ?? [],
      winning_hooks: item.winningHooks ?? [],
      weak_cta: item.weakCta ?? [],
      platform: item.platform ?? null,
      gen_source: item.genSource ?? null,
    };

    await sql`
      INSERT INTO learning_records (
        brand_id, record_type, insight, supporting_data, related_content_id, generated_by_agent_id, status
      ) VALUES (
        ${brandId}::uuid, ${recordType}, ${insight},
        ${JSON.stringify(supporting)}::jsonb, ${related}::uuid, ${agentId}, 'pending_review'
      )
    `;
    blocked.add(recordType);
    created += 1;
  }

  return { brandId, created, skipped: created ? null : '本週已有待核准建議或模型未產出可用洞察' };
}

export async function analyzeAllBrandPerformance(env: Env): Promise<AnalyzeBrandResult[]> {
  const sql = getSql(env);
  const brands = await sql`SELECT id FROM brands WHERE is_active = true`;
  const out: AnalyzeBrandResult[] = [];
  for (const row of brands as { id: string }[]) {
    try {
      out.push(await analyzeBrandPerformance(env, row.id));
    } catch (e) {
      console.error('[performance-learn] 品牌分析失敗', row.id, e);
      out.push({ brandId: row.id, created: 0, skipped: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
