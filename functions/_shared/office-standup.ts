import type { Env } from './env';
import { getSql } from './db';
import { claudeChatJsonWithUsage } from './claude';
import { ensureOfficeSuggestions, setOfficeActivity } from './office-directive';
import { fetchGoogleTrendsTW, fetchTaiwanNews } from './sources';
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

async function liveHotLeads(): Promise<SignalFact[]> {
  try {
    const [trends, news] = await Promise.race([
      Promise.all([fetchGoogleTrendsTW(8), fetchTaiwanNews(6)]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('hot-timeout')), 2500)),
    ]);
    const seen = new Set<string>();
    const out: SignalFact[] = [];
    for (const item of [...trends, ...news]) {
      const title = item.title.replace(/\s+/g, ' ').trim().slice(0, 28);
      const key = title.toLowerCase();
      if (title.length < 2 || seen.has(key)) continue;
      seen.add(key);
      out.push({ title, summary: item.snippet?.slice(0, 80) ?? null, url: item.url ?? null });
      if (out.length >= 12) break;
    }
    return out;
  } catch {
    return [];
  }
}

function recentByBrand(rows: { slug: string; title: string }[]): string {
  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    const title = row.title?.trim();
    if (!title) continue;
    grouped[row.slug] = grouped[row.slug] ?? [];
    if (grouped[row.slug].length < 6) grouped[row.slug].push(title.slice(0, 32));
  }
  return BRAND_SLUGS.map((slug) => `${slug}：${grouped[slug]?.join('、') || '這十天沒有標題'}`).join('\n');
}

function learningByBrand(rows: { slug: string; insight: string; supporting_data: unknown }[]): string {
  const grouped: Record<string, string[]> = {};
  for (const row of rows) {
    const hooks = row.supporting_data && typeof row.supporting_data === 'object'
      ? (row.supporting_data as { winning_hooks?: unknown }).winning_hooks
      : [];
    const bits = [
      row.insight?.trim(),
      ...(Array.isArray(hooks) ? hooks.map((hook) => String(hook).trim()) : []),
    ].filter(Boolean).slice(0, 2);
    if (!bits.length) continue;
    grouped[row.slug] = grouped[row.slug] ?? [];
    if (grouped[row.slug].length < 3) grouped[row.slug].push(bits.join('／').slice(0, 80));
  }
  const text = BRAND_SLUGS.map((slug) => `${slug}：${grouped[slug]?.join('；') || '無'}`).join('\n');
  return text.includes('：') ? text : '無';
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

  await ensureOfficeSuggestions(env).catch(() => undefined);
  const hotLeads = liveHotLeads();
  const [signalRows, claimRows, podcastRows, videoRows, brandRows, adviceRows, recentRows, learningRows, hot] = await Promise.all([
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
    sql`
      SELECT coalesce(a.persona->>'nickname', a.display_name) AS nickname, s.body
      FROM office_suggestions s
      JOIN ai_agents a ON a.id = s.agent_id
      WHERE s.created_at > now() - interval '14 days'
      ORDER BY s.created_at DESC
      LIMIT 12
    `.catch(() => []),
    sql`
      SELECT b.slug, c.title
      FROM contents c
      JOIN brands b ON b.id = c.brand_id
      WHERE b.slug IN ('taskgo', 'homigo', 'washgo')
        AND c.status IN ('published', 'scheduled')
        AND c.title IS NOT NULL
        AND c.created_at > now() - interval '10 days'
      ORDER BY c.created_at DESC
      LIMIT 24
    `.catch(() => []),
    sql`
      SELECT b.slug, lr.insight, lr.supporting_data
      FROM learning_records lr
      JOIN brands b ON b.id = lr.brand_id
      WHERE b.slug IN ('taskgo', 'homigo', 'washgo')
        AND lr.status = 'approved'
      ORDER BY lr.created_at DESC
      LIMIT 9
    `.catch(() => []),
    hotLeads,
  ]);

  const hotFacts: SignalFact[] = hot;
  const signals: SignalFact[] = [
    ...hotFacts,
    ...(signalRows as { title: string; summary: string | null; source_url: string | null }[])
      .map((row) => ({ title: row.title, summary: row.summary, url: row.source_url })),
  ];
  const signalText = signals.length
    ? signals.map((signal, index) => {
      const lane = index < hotFacts.length ? '熱門' : '情報';
      return `${index}. [${lane}] ${signal.title}${signal.summary ? ` — ${signal.summary.slice(0, 80)}` : ''}`;
    }).join('\n')
    : '（這一輪沒有熱門，也沒有三天內的情報）';
  const recentText = recentByBrand(recentRows as { slug: string; title: string }[]);
  const learningText = learningByBrand(learningRows as { slug: string; insight: string; supporting_data: unknown }[]);
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
      bill: false,
      temperature: 0.7,
      maxTokens: 1600,
      messages: [
        {
          role: 'system',
          content: [
            '你是 Go 行銷中心的晨會記錄。三個品牌要像台灣社群在聊天，不要像顧問在寫策略。',
            '只准使用下面清單裡出現過的關鍵字和事實。不准添媒體名、客戶數、排名、瀏覽數，也不准把沒出現的新聞說成已經發生。',
            '回傳一個 JSON：{"brands":[{"slug":"taskgo|homigo|washgo","theme":"40字內、像 Threads 前兩行會停下來的一句話","doMore":["這一則的場面，不要寫策略"],"doLess":["這一篇不要碰的說法"],"signalIndexes":[清單編號]}],"podcastTopic":"40字內的一個場面","imageBrief":"60字內的一個畫面","imageSlug":"taskgo|homigo|washgo","videoNote":"60字內","lines":[{"who":"阿豪|小咪|阿樂|新聞收集|行銷小編|發文小編|Podcast小編|圖片小編|影片小編","text":"42字內"}]}',
            '三個品牌必須各接不同編號。接不上自己的牌子就換一條，不要三個人寫同一則租屋或同一則工安。',
            'theme 要是一個具體場面或一句沒被接住的話。禁止「建立信任」「團隊文化」「合規」「指南」「透明溝通」這種總結句。',
            '阿豪只講工地、派工、回報對不攏，句子短。小咪只講租屋場面，不站隊罵房東或房客。阿樂只講洗衣店櫃台、洗標、羽絨、客人問洗好了沒；租屋新聞接不上就寫店裡的事。',
            'lines 4 到 6 句，要有人把題目搶走或反對，禁止每句都以「正在」開頭。新聞收集只報關鍵字，不把三個品牌收成同一篇。',
            '近十天發過的標題不要再寫同一句。負責人交代只當方向，不能寫成新聞或數字。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `現在熱門與三天內情報:\n${signalText}\n\n近十天已發或已排的標題:\n${recentText}\n\n成效上記得住的切角:\n${learningText}\n\n不可宣稱:\n${claimText}\n\n負責人交代:\n${(adviceRows as { nickname: string; body: string }[]).map((row) => `${row.nickname}：${row.body}`).join('\n') || '無'}\n\n未上架 Podcast:${podcasts.map((item) => item.title).join('、') || '無'}\n影片:${videos.map((item) => `${item.title}(${item.status})`).join('、') || '無'}`,
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
  const lively = plan.bubbles.filter((bubble) => !/^正在/.test(bubble.text));
  if (lively.length >= 3) plan.bubbles = lively;
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
