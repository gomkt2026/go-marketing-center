import type { Env } from './env';
import { getSql } from './db';
import { claudeChatJsonWithUsage } from './claude';
import { setOfficeActivity } from './office-directive';
import {
  BRAND_SLUGS,
  OFFICE_CAST,
  type OfficePlan,
  type PodcastSnap,
  type SignalFact,
  type VideoSnap,
  budgetBlocks,
  factProblem,
  haikuCostUsd,
  isOfficeQuietHour,
  nameplates,
  parseStandupPayload,
  scrubPlanThemes,
  standupApplies,
} from './office-facts';

export interface OfficeStandupResult {
  status: 'completed' | 'budget_exhausted' | 'failed';
  standupId: string | null;
  note: string | null;
  applyToGeneration: boolean;
  themes: { slug: string; theme: string }[];
}

async function monthSpend(env: Env): Promise<number> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT coalesce(sum(cost_usd), 0)::float AS spent
    FROM office_standups
    WHERE started_at >= date_trunc('month', timezone('Asia/Taipei', now())) AT TIME ZONE 'Asia/Taipei'
  `;
  return Number((rows[0] as { spent: number }).spent ?? 0);
}

async function autoPublishOn(env: Env): Promise<boolean> {
  const sql = getSql(env);
  const rows = await sql`SELECT auto_publish FROM office_settings WHERE id = 1`;
  return (rows[0] as { auto_publish?: boolean } | undefined)?.auto_publish !== false;
}

async function insertStandup(
  env: Env,
  row: {
    status: OfficeStandupResult['status'];
    directive: OfficePlan | Record<string, never>;
    bubbles: { who: string; text: string }[];
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    apply: boolean;
    note: string | null;
  },
): Promise<string> {
  const sql = getSql(env);
  const validUntil = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const inserted = await sql`
    INSERT INTO office_standups (
      status, directive, bubbles, input_tokens, output_tokens, cost_usd,
      apply_to_generation, valid_until, note
    ) VALUES (
      ${row.status},
      ${JSON.stringify(row.directive)}::jsonb,
      ${JSON.stringify(row.bubbles)}::jsonb,
      ${row.inputTokens},
      ${row.outputTokens},
      ${row.costUsd},
      ${row.apply},
      ${validUntil}::timestamptz,
      ${row.note}
    )
    RETURNING id
  `;
  return (inserted[0] as { id: string }).id;
}

function brandIdBySlug(rows: { id: string; slug: string }[], slug: string): string | null {
  return rows.find((row) => row.slug === slug)?.id ?? null;
}

export async function runOfficeStandup(env: Env, at = new Date()): Promise<OfficeStandupResult> {
  const sql = getSql(env);
  const quiet = isOfficeQuietHour(at);
  const enabled = await autoPublishOn(env);
  const apply = standupApplies(enabled, at);
  const spent = await monthSpend(env);
  if (budgetBlocks(spent)) {
    const standupId = await insertStandup(env, {
      status: 'budget_exhausted',
      directive: {},
      bubbles: [{ who: '行銷小編', text: '這班額度用完' }],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      apply: false,
      note: '這班額度用完',
    });
    await setOfficeActivity(env, 'strategy', 'blocked', '這班額度用完');
    return { status: 'budget_exhausted', standupId, note: '這班額度用完', applyToGeneration: false, themes: [] };
  }

  const [signalRows, claimRows, podcastRows, videoRows, brandRows] = await Promise.all([
    sql`
      SELECT ms.title, ms.summary, ms.source_url, b.slug
      FROM market_signals ms
      JOIN brands b ON b.id = ms.brand_id
      WHERE b.slug IN ('taskgo', 'homigo', 'washgo')
        AND ms.discovered_at > now() - interval '3 days'
      ORDER BY ms.relevance_score DESC NULLS LAST, ms.discovered_at DESC
      LIMIT 8
    `,
    sql`
      SELECT b.slug, r.statement
      FROM brand_rules r
      JOIN brands b ON b.id = r.brand_id
      WHERE b.slug IN ('taskgo', 'homigo', 'washgo')
        AND r.rule_type IN ('cannot_claim', 'negative_rule')
      ORDER BY b.slug, r.sort_order
      LIMIT 36
    `,
    sql`
      SELECT coalesce(title, '未命名') AS title, status::text AS status
      FROM podcast_episodes
      WHERE status IN ('script_draft', 'audio_generating', 'ready_for_review')
      ORDER BY created_at DESC
      LIMIT 5
    `,
    sql`
      SELECT coalesce(title, '未命名') AS title, status::text AS status
      FROM video_jobs
      WHERE status <> 'rejected'
      ORDER BY updated_at DESC
      LIMIT 5
    `,
    sql`SELECT id, slug FROM brands WHERE slug IN ('taskgo', 'homigo', 'washgo')`,
  ]);

  const signals: SignalFact[] = (signalRows as { title: string; summary: string | null; source_url: string | null }[])
    .map((row) => ({ title: row.title, summary: row.summary, url: row.source_url }));
  const signalText = signals.length
    ? signals.map((signal, index) => `${index}. ${signal.title}${signal.summary ? ` — ${signal.summary.slice(0, 80)}` : ''}`).join('\n')
    : '（這三天沒有新的情報）';
  const claimsBySlug: Record<string, string[]> = {};
  for (const row of claimRows as { slug: string; statement: string }[]) {
    claimsBySlug[row.slug] = claimsBySlug[row.slug] ?? [];
    claimsBySlug[row.slug].push(row.statement);
  }
  const claimText = BRAND_SLUGS.map((slug) => `${slug}：${(claimsBySlug[slug] ?? []).slice(0, 4).join('；') || '無'}`).join('\n');
  const podcasts = podcastRows as PodcastSnap[];
  const videos = videoRows as VideoSnap[];

  let plan: OfficePlan | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const completion = await claudeChatJsonWithUsage<unknown>(env, {
      temperature: 0.4,
      maxTokens: 1200,
      messages: [
        {
          role: 'system',
          content: [
            '你是 Go 行銷中心的晨會記錄。只根據下面給的情報做決定，不准添媒體露出、客戶數、排名或沒出現的細節。',
            '回傳一個 JSON：{"brands":[{"slug":"taskgo|homigo|washgo","theme":"40字內方向","doMore":["短句"],"doLess":["短句"],"signalIndexes":[情報編號]}],"podcastTopic":"40字內","imageBrief":"60字內","imageSlug":"taskgo|homigo|washgo","videoNote":"60字內","lines":[{"who":"阿豪|小咪|阿樂|新聞收集|行銷小編|發文小編|Podcast小編|圖片小編|影片小編","text":"42字內現在進行式"}]}',
            'lines 最多 8 句。signalIndexes 只能用下面出現的編號。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `情報:\n${signalText}\n\n不可宣稱:\n${claimText}\n\n未上架 Podcast:${podcasts.map((item) => item.title).join('、') || '無'}\n影片:${videos.map((item) => `${item.title}(${item.status})`).join('、') || '無'}`,
        },
      ],
    });
    inputTokens = completion.usage.inputTokens;
    outputTokens = completion.usage.outputTokens;
    plan = parseStandupPayload(completion.data, signals);
  } catch (e) {
    const note = e instanceof Error ? e.message.slice(0, 180) : '晨會失敗';
    const standupId = await insertStandup(env, {
      status: 'failed',
      directive: {},
      bubbles: [{ who: '行銷小編', text: '這一班沒有開成' }],
      inputTokens,
      outputTokens,
      costUsd: haikuCostUsd(inputTokens, outputTokens),
      apply: false,
      note,
    });
    await setOfficeActivity(env, 'strategy', 'blocked', '這一班沒有開成');
    return { status: 'failed', standupId, note, applyToGeneration: false, themes: [] };
  }

  if (!plan) {
    const standupId = await insertStandup(env, {
      status: 'failed',
      directive: {},
      bubbles: [],
      inputTokens,
      outputTokens,
      costUsd: haikuCostUsd(inputTokens, outputTokens),
      apply: false,
      note: '晨會回傳無法使用',
    });
    return { status: 'failed', standupId, note: '晨會回傳無法使用', applyToGeneration: false, themes: [] };
  }

  plan = scrubPlanThemes(plan, claimsBySlug);
  plan.bubbles = plan.bubbles.filter((bubble) => !factProblem(bubble.text, Object.values(claimsBySlug).flat(), plan!.citations));
  const plates = nameplates(plan, { quiet, autoPublish: enabled, videos, podcasts });
  if (!plan.bubbles.length) {
    plan.bubbles = plates.slice(0, 8).map((plate) => ({
      who: OFFICE_CAST.find((cast) => cast.key === plate.key)?.nickname ?? plate.key,
      text: plate.task.slice(0, 42),
    }));
  }

  const costUsd = haikuCostUsd(inputTokens, outputTokens);
  const standupId = await insertStandup(env, {
    status: 'completed',
    directive: plan,
    bubbles: plan.bubbles,
    inputTokens,
    outputTokens,
    costUsd,
    apply,
    note: quiet ? '凌晨這一班只留方向，八點才發' : null,
  });

  for (const plate of plates) {
    await setOfficeActivity(env, plate.key, plate.status, plate.task);
  }
  for (const brand of plan.brands) {
    const brandId = brandIdBySlug(brandRows as { id: string; slug: string }[], brand.slug);
    const cast = OFFICE_CAST.find((item) => item.slug === brand.slug);
    if (!brandId || !cast) continue;
    const agentRows = await sql`
      SELECT a.id FROM ai_agents a
      JOIN agent_roles r ON r.id = a.role_id
      JOIN brands b ON b.id = a.brand_id
      WHERE r.code = 'brand_ai' AND b.slug = ${brand.slug} AND a.is_active = true
      LIMIT 1
    `;
    const agentId = (agentRows[0] as { id: string } | undefined)?.id;
    if (!agentId) continue;
    await sql`
      INSERT INTO agent_findings (brand_id, agent_id, standup_id, source_url, summary)
      VALUES (${brandId}::uuid, ${agentId}::uuid, ${standupId}::uuid, ${brand.sourceUrl}, ${brand.finding})
    `;
  }

  return {
    status: 'completed',
    standupId,
    note: quiet ? '凌晨這一班只留方向，八點才發' : null,
    applyToGeneration: apply,
    themes: plan.brands.map((brand) => ({ slug: brand.slug, theme: brand.theme })),
  };
}
