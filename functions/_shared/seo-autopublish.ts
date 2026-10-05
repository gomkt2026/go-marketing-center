import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson } from './openai';
import { logActivity } from './activity';
import { AUTO_POST_BRAND_SLUGS } from './auto-post-brands';
import { brandSeoFacts, type BrandContext, type SeoTopicSeed } from './prompts';
import { findBrandAgent, generateSeoArticle, saveSeoArticle, type SeoArticleResult } from './generate';
import { loadBrandCollaterals } from './documents';
import {
  annotateSeoTopics,
  findCoveringTitle,
  listSeoTopicsForBrand,
  loadSeoContentTitles,
} from './seo-topics';
import {
  buildWebsitePayload,
  loadWebsiteDestination,
  publishWebsiteArticle,
  validateWebsitePayload,
  websiteCta,
  type WebsiteSeoMeta,
} from './website-articles';

/** 三品牌輪流，成功發布後至少隔 3 個台灣日曆日再寫下一篇。 */
const SEO_AUTO_GAP_DAYS = 3;
const BRAND_ORDER = [...AUTO_POST_BRAND_SLUGS];

export interface SeoAutoResult {
  ok: boolean;
  skipped?: string;
  brand?: string;
  title?: string;
  url?: string;
  error?: string;
}

type SourceKind = 'asset' | 'news' | 'current_event' | 'knowledge' | 'topic_bank';

interface SeoCandidate {
  kind: SourceKind;
  title: string;
  facts: string;
  sourceUrl?: string;
  marketSignalId?: string;
  topicSeed?: SeoTopicSeed;
}

interface SeoPick {
  candidate: SeoCandidate;
  topic: string;
  primaryKeyword: string;
  angle: string;
  category?: SeoTopicSeed['category'];
  searchIntent?: SeoTopicSeed['searchIntent'];
  audience?: SeoTopicSeed['audience'];
  reason: string;
}

const KIND_LABEL: Record<SourceKind, string> = {
  asset: '素材',
  news: '新聞',
  current_event: '時事',
  knowledge: '知識',
  topic_bank: '主題庫',
};

function taipeiDay(input: string | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(input));
}

function dayDiff(fromDay: string, toDay: string): number {
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

function nextSlug(last: string | null, available: string[]): string {
  const order = BRAND_ORDER.filter((slug) => available.includes(slug));
  if (!order.length) return available[0] ?? 'homigo';
  if (!last) return order[0];
  const index = order.indexOf(last as typeof order[number]);
  return order[(index + 1) % order.length] ?? order[0];
}

function signalKind(signalType: string): SourceKind {
  if (signalType === 'news') return 'news';
  if (signalType === 'evergreen' || signalType === 'social_content') return 'knowledge';
  return 'current_event';
}

function standardsViolations(slug: string, text: string): string[] {
  const errors: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/全台第一/, '不得寫全台第一'],
    [/5[,，]000\+|5000\+/, '不得寫未核實客戶數'],
    [/98\s*%|98％/, '不得寫未核實滿意度'],
    [/保證不縮水|保證收租|保證接案/, '不得寫保證成效'],
    [/歡迎詢問|視情況而定/, 'FAQ 與正文不要空話'],
  ];
  for (const [pattern, message] of checks) {
    if (pattern.test(text)) errors.push(message);
  }
  if (slug === 'washgo' && /洗車|汽車美容|車體鍍膜/.test(text)) errors.push('Washgo 不得寫洗車');
  if (slug === 'taskgo' && /監控員工|監視員工/.test(text)) errors.push('TaskGo 不得把打卡寫成監控員工');
  const headings = text.match(/^##\s+\S/gm) ?? [];
  if (headings.length < 3) errors.push(`正文至少 3 個 H2（目前 ${headings.length}）`);
  return errors;
}

function articleProblems(slug: string, article: SeoArticleResult): string[] {
  const text = [article.title, article.body, article.answer_box, article.description].filter(Boolean).join('\n');
  return [
    ...validateWebsitePayload({
      slug,
      title: article.title,
      description: article.description || article.seoMeta.description || article.seoMeta.seo_description,
      seoMeta: article.seoMeta,
      bodyMd: article.body,
      cta: article.cta,
    }),
    ...standardsViolations(slug, text),
  ];
}

async function loadCandidates(
  env: Env,
  brand: { id: string; slug: string; name: string },
  covered: string[],
  rejected: string[],
): Promise<SeoCandidate[]> {
  const sql = getSql(env);
  const [signals, press, assets, docs, topics] = await Promise.all([
    sql`
      SELECT id, title, summary, source_url, signal_type
      FROM market_signals
      WHERE brand_id = ${brand.id}::uuid
        AND status <> 'dismissed'
        AND discovered_at > now() - interval '21 days'
      ORDER BY relevance_score DESC NULLS LAST, discovered_at DESC
      LIMIT 6
    `,
    sql`
      SELECT headline, summary, article_url, outlet, claimable_facts
      FROM press_coverages
      WHERE brand_id = ${brand.id}::uuid
        AND status <> 'dismissed'
        AND created_at > now() - interval '45 days'
      ORDER BY created_at DESC
      LIMIT 4
    `,
    sql`
      SELECT name, caption, feature, usage_context
      FROM brand_assets
      WHERE brand_id = ${brand.id}::uuid
        AND asset_status = 'active'
        AND coalesce(caption, feature, usage_context, '') <> ''
      ORDER BY created_at DESC
      LIMIT 6
    `,
    loadBrandCollaterals(env, brand.id, 4),
    listSeoTopicsForBrand(env, brand.id, brand.slug).then((bank) => annotateSeoTopics(env, brand.id, bank)),
  ]);

  const blocked = new Set(rejected.map((item) => item.replace(/\s+/g, '')));
  const fresh = (title: string) => {
    const key = title.replace(/\s+/g, '');
    if (!key || blocked.has(key)) return false;
    return !findCoveringTitle({ topic: title, angle: title }, covered);
  };

  const out: SeoCandidate[] = [];
  for (const row of signals as { id: string; title: string; summary: string | null; source_url: string | null; signal_type: string }[]) {
    if (!fresh(row.title)) continue;
    out.push({
      kind: signalKind(row.signal_type),
      title: row.title,
      facts: clip(row.summary || row.title, 360),
      sourceUrl: row.source_url || undefined,
      marketSignalId: row.id,
    });
  }
  for (const row of press as { headline: string; summary: string | null; article_url: string | null; outlet: string; claimable_facts: unknown }[]) {
    if (!fresh(row.headline)) continue;
    const facts = Array.isArray(row.claimable_facts) ? row.claimable_facts.map(String).slice(0, 4).join('；') : '';
    out.push({
      kind: 'news',
      title: row.headline,
      facts: clip([row.outlet, row.summary, facts].filter(Boolean).join('。'), 360),
      sourceUrl: row.article_url || undefined,
    });
  }
  for (const row of assets as { name: string; caption: string | null; feature: string | null; usage_context: string | null }[]) {
    const title = row.caption || row.feature || row.name;
    if (!fresh(title)) continue;
    out.push({
      kind: 'asset',
      title,
      facts: clip([row.caption, row.feature, row.usage_context].filter(Boolean).join('。'), 320),
    });
  }
  for (const doc of docs) {
    if (!fresh(doc.title)) continue;
    const points = doc.keyPoints.slice(0, 5).join('；');
    out.push({
      kind: 'knowledge',
      title: doc.title,
      facts: clip([doc.rawContent?.slice(0, 180), points].filter(Boolean).join('。'), 360),
    });
  }
  for (const topic of topics) {
    if (topic.coverage !== 'open') continue;
    if (!fresh(topic.topic) || !fresh(topic.primaryKeyword || topic.topic)) continue;
    out.push({
      kind: 'topic_bank',
      title: topic.topic,
      facts: clip(topic.angle, 320),
      topicSeed: topic,
    });
  }
  return out;
}

function rankCandidates(candidates: SeoCandidate[], lastKind: string | null): SeoCandidate[] {
  const weight: Record<SourceKind, number> = {
    current_event: 40,
    news: 36,
    knowledge: 30,
    asset: 28,
    topic_bank: 18,
  };
  return [...candidates].sort((a, b) => {
    const aScore = weight[a.kind] + (a.kind !== lastKind ? 12 : 0) + (a.marketSignalId ? 4 : 0);
    const bScore = weight[b.kind] + (b.kind !== lastKind ? 12 : 0) + (b.marketSignalId ? 4 : 0);
    return bScore - aScore;
  });
}

function guessAudience(slug: string, text: string): SeoTopicSeed['audience'] | undefined {
  if (slug !== 'washgo') return undefined;
  return /店主|門市|洗廠|調撥|司機|系統怎麼選|後台/.test(text) ? 'merchant' : 'consumer';
}

async function pickTopic(
  env: Env,
  brand: { slug: string; name: string },
  ranked: SeoCandidate[],
  covered: string[],
  lastKind: string | null,
): Promise<SeoPick> {
  const shortlist = ranked.slice(0, 8);
  const fallback = shortlist[0];
  const fallbackPick = (candidate: SeoCandidate): SeoPick => ({
    candidate,
    topic: candidate.topicSeed?.topic || candidate.title,
    primaryKeyword: candidate.topicSeed?.primaryKeyword || clip(candidate.title, 18),
    angle: candidate.topicSeed?.angle || candidate.facts,
    category: candidate.topicSeed?.category ?? (candidate.kind === 'current_event' ? 'talk' : 'pain'),
    searchIntent: candidate.topicSeed?.searchIntent ?? 'informational',
    audience: candidate.topicSeed?.audience ?? guessAudience(brand.slug, `${candidate.title}${candidate.facts}`),
    reason: '依尚未覆蓋的來源直接選題',
  });
  if (!fallback) {
    throw new Error('沒有可寫的新題：素材、新聞、時事、知識與主題庫都已覆蓋');
  }
  try {
    const picked = await chatCompleteJson<{
      index?: number;
      topic?: string;
      primaryKeyword?: string;
      angle?: string;
      category?: SeoTopicSeed['category'];
      searchIntent?: SeoTopicSeed['searchIntent'];
      audience?: SeoTopicSeed['audience'];
      reason?: string;
    }>(env, {
      temperature: 0.2,
      maxTokens: 500,
      timeoutMs: 25_000,
      messages: [
        {
          role: 'system',
          content: [
            `你是${brand.name}官網 SEO 選題編輯。這篇會直接發布，沒有人工審閱。`,
            '只從候選編號裡選一個台灣人真的會搜、而且既有長文還沒寫過的題。',
            '優先：還沒寫過的時事或新聞 > 素材／知識裡的具體場景 > 主題庫。若上一篇來源類型相同，換一種類型。',
            '不可選洗車、全台第一、未核實客戶數、保證收租／接案／不縮水。政策題必須該候選有情報編號。',
            'topic 要像搜尋問句，12-32 字。primaryKeyword 2-12 字。angle 只可改寫該候選的事實，不可加新數字。',
            brandSeoFacts(brand.slug),
          ].filter(Boolean).join('\n'),
        },
        {
          role: 'user',
          content: [
            `上一篇來源類型:${lastKind ? KIND_LABEL[lastKind as SourceKind] ?? lastKind : '無'}`,
            `已有長文:\n${covered.slice(0, 24).map((title) => `- ${title}`).join('\n') || '- （尚無）'}`,
            shortlist.map((item, index) => (
              `${index}. [${KIND_LABEL[item.kind]}] ${item.title}\n事實:${item.facts}${item.marketSignalId ? '\n有情報編號' : ''}`
            )).join('\n'),
            '回傳 JSON:{"index":編號,"topic":"搜尋題","primaryKeyword":"主關鍵字","angle":"只用該候選事實的角度","category":"pain|product|trust|talk","searchIntent":"informational|solution","audience":"consumer|merchant","reason":"為何現在寫這題"}',
          ].join('\n\n'),
        },
      ],
    });
    const index = Number(picked.index);
    const candidate = shortlist[index] ?? fallback;
    return {
      candidate,
      topic: clip(picked.topic || candidate.title, 40),
      primaryKeyword: clip(picked.primaryKeyword || candidate.topicSeed?.primaryKeyword || candidate.title, 18),
      angle: clip(picked.angle || candidate.facts, 240),
      category: (picked.category && picked.category !== 'policy' ? picked.category : undefined) || candidate.topicSeed?.category || 'talk',
      searchIntent: picked.searchIntent || candidate.topicSeed?.searchIntent || 'informational',
      audience: picked.audience || candidate.topicSeed?.audience || guessAudience(brand.slug, candidate.facts),
      reason: clip(picked.reason || '選題編輯挑了尚未覆蓋的題', 120),
    };
  } catch (err) {
    console.error('[seo-auto] 選題模型失敗，改用排序第一題', err instanceof Error ? err.message : err);
    return fallbackPick(fallback);
  }
}

async function writeUntilValid(
  env: Env,
  brandCtx: BrandContext,
  pick: SeoPick,
): Promise<SeoArticleResult> {
  const sourceSummary = [
    `來源類型:${KIND_LABEL[pick.candidate.kind]}`,
    `選題理由:${pick.reason}`,
    `可引用事實（沒有寫到的數字、媒體、客戶數都不要發明）:${pick.candidate.facts}`,
    pick.candidate.sourceUrl ? `若提到出處，只能用這個 URL:${pick.candidate.sourceUrl}` : '',
    pick.angle,
  ].filter(Boolean).join('\n');
  const seed: SeoTopicSeed = {
    ...(pick.candidate.topicSeed ?? { topic: pick.topic, angle: pick.angle }),
    topic: pick.topic,
    angle: pick.angle,
    primaryKeyword: pick.primaryKeyword,
    category: pick.category === 'policy' ? 'talk' : pick.category,
    searchIntent: pick.searchIntent,
    audience: pick.audience,
  };
  let extra = '這篇會直接發到官網。開頭先回答搜尋題，文末才放指定 CTA。不要寫成政策時事分類。';
  let article = await generateSeoArticle(env, {
    brandCtx,
    sourceTitle: pick.topic,
    sourceSummary,
    topicSeed: seed,
    extraInstruction: extra,
  });
  let problems = articleProblems(brandCtx.slug, article);
  if (!problems.length) return article;
  extra = `上一稿未通過，必須改正後才能發布：${problems.slice(0, 6).join('；')}。仍然只能用原本提供的事實。`;
  article = await generateSeoArticle(env, {
    brandCtx,
    sourceTitle: pick.topic,
    sourceSummary,
    topicSeed: seed,
    extraInstruction: extra,
  });
  problems = articleProblems(brandCtx.slug, article);
  if (problems.length) throw new Error(`未通過發布規範：${problems.slice(0, 6).join('；')}`);
  return article;
}

async function publishNow(
  env: Env,
  brand: { id: string; slug: string },
  contentId: string,
  versionId: string,
  article: SeoArticleResult,
): Promise<string> {
  const dest = await loadWebsiteDestination(env, brand.id);
  if (!dest?.ingestBaseUrl || !dest.hasIngestKey) throw new Error('官網 ingest 尚未設定，不能直接發布');
  const sql = getSql(env);
  let seoMeta: WebsiteSeoMeta = article.seoMeta;
  const send = async () => {
    const payload = buildWebsitePayload({
      contentId,
      title: article.title,
      bodyMd: article.body,
      cta: websiteCta(brand.slug, seoMeta.audience),
      seoMeta,
    });
    return publishWebsiteArticle(env, dest, payload);
  };
  let published;
  try {
    published = await send();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/409/.test(message)) throw err;
    seoMeta = { ...seoMeta, slug: `${seoMeta.slug}-2`.slice(0, 80) };
    published = await send();
  }
  seoMeta = { ...seoMeta, public_url: published.article.public_url };
  await sql`
    UPDATE content_versions SET seo_meta = ${JSON.stringify(seoMeta)}
    WHERE id = ${versionId}::uuid
  `;
  const jobRows = await sql`
    INSERT INTO publishing_jobs (
      content_id, content_version_id, platform, status, published_at, external_post_id
    ) VALUES (
      ${contentId}::uuid, ${versionId}::uuid, 'website', 'published', now(), ${published.article.public_url}
    ) RETURNING id
  `;
  const jobId = (jobRows[0] as { id: string }).id;
  await sql`
    INSERT INTO publishing_logs (publishing_job_id, event, detail)
    VALUES (${jobId}::uuid, 'published', ${`官網長文已自動發布 ${published.article.public_url}`})
  `;
  await sql`
    UPDATE contents SET status = 'published', updated_at = now()
    WHERE id = ${contentId}::uuid
  `;
  return published.article.public_url;
}

export async function runSeoAutoPublish(env: Env): Promise<SeoAutoResult> {
  const sql = getSql(env);
  const brands = await sql`
    SELECT id, slug, name FROM brands
    WHERE is_active = true AND slug = ANY(${BRAND_ORDER}::text[])
  `;
  const available = brands as { id: string; slug: string; name: string }[];
  if (!available.length) return { ok: false, skipped: '沒有可發文的品牌' };

  const recent = await sql`
    SELECT c.created_at, b.slug, c.generation_prompt_meta
    FROM contents c
    JOIN brands b ON b.id = c.brand_id
    WHERE c.content_type = 'article'
      AND c.target_platform = 'website'
      AND c.status = 'published'
      AND c.generation_prompt_meta->>'source' = 'seo_auto'
    ORDER BY c.created_at DESC
    LIMIT 1
  `;
  const last = recent[0] as { created_at: string; slug: string; generation_prompt_meta: { sourceKind?: string } | null } | undefined;
  if (last) {
    const gap = dayDiff(taipeiDay(last.created_at), taipeiDay(new Date()));
    if (gap < SEO_AUTO_GAP_DAYS) {
      return { ok: true, skipped: `距上一篇自動長文 ${gap} 天，未滿 ${SEO_AUTO_GAP_DAYS} 天`, brand: last.slug };
    }
  }

  const started = await sql`
    SELECT created_at FROM activity_logs
    WHERE action = 'seo.auto_started' AND created_at > now() - interval '6 hours'
    LIMIT 1
  `;
  if (started.length) return { ok: true, skipped: '6 小時內已啟動過，避免重複產文' };

  const slugs = available.map((item) => item.slug);
  const first = nextSlug(last?.slug ?? null, slugs);
  const order = [first, nextSlug(first, slugs)].filter((slug, index, list) => list.indexOf(slug) === index);
  await logActivity(env, {
    brandId: available.find((item) => item.slug === first)?.id,
    actorType: 'ai_agent',
    action: 'seo.auto_started',
    entityType: 'content',
    afterState: { brand: first },
  });

  let lastError = '沒有品牌完成發布';
  for (const slug of order) {
    const brand = available.find((item) => item.slug === slug);
    if (!brand) continue;
    const result = await publishBrandSeo(env, brand, last?.generation_prompt_meta?.sourceKind ?? null);
    if (result.url) return result;
    lastError = result.error || lastError;
    console.error(`[seo-auto] ${brand.slug} 這輪未發出，改試下一個品牌`, lastError);
  }
  return { ok: false, error: lastError.slice(0, 300) };
}

async function publishBrandSeo(
  env: Env,
  brand: { id: string; slug: string; name: string },
  lastKind: string | null,
): Promise<SeoAutoResult> {
  const sql = getSql(env);
  const dest = await loadWebsiteDestination(env, brand.id);
  if (!dest?.hasIngestKey || !dest.ingestBaseUrl) {
    const error = `${brand.name} 尚未設定官網 ingest，這次不發布`;
    await logActivity(env, {
      brandId: brand.id,
      actorType: 'ai_agent',
      action: 'seo.auto_failed',
      entityType: 'content',
      afterState: { error },
    });
    return { ok: false, brand: brand.slug, error };
  }

  const titles = await loadSeoContentTitles(env, brand.id);
  const covered = [...titles.published, ...titles.drafts];
  const failed = await sql`
    SELECT after_state FROM activity_logs
    WHERE action = 'seo.auto_failed'
      AND brand_id = ${brand.id}::uuid
      AND created_at > now() - interval '14 days'
    ORDER BY created_at DESC
    LIMIT 8
  `;
  const rejected = (failed as { after_state: { topic?: string } | null }[])
    .map((row) => row.after_state?.topic || '')
    .filter(Boolean);

  let topicForLog = '';
  try {
    const candidates = await loadCandidates(env, brand, covered, rejected);
    const pick = await pickTopic(
      env,
      brand,
      rankCandidates(candidates, lastKind),
      covered,
      lastKind,
    );
    topicForLog = pick.topic;
    const brandCtx: BrandContext = {
      brandId: brand.id,
      slug: brand.slug,
      name: brand.name,
      systemPrompt: '',
    };
    const agentId = await findBrandAgent(env, brand.id);
    const article = await writeUntilValid(env, brandCtx, pick);
    const { contentId, versionId } = await saveSeoArticle(env, {
      brandCtx,
      article,
      generatedByAgentId: agentId,
      status: 'draft',
      sourceMarketSignalId: pick.candidate.marketSignalId ?? null,
      promptMeta: {
        source: 'seo_auto',
        sourceKind: pick.candidate.kind,
        topic: pick.topic,
        reason: pick.reason,
        sourceUrl: pick.candidate.sourceUrl ?? null,
      },
    });
    try {
      const url = await publishNow(env, brand, contentId, versionId, article);
      if (pick.candidate.marketSignalId) {
        await sql`
          UPDATE market_signals SET status = 'used'
          WHERE id = ${pick.candidate.marketSignalId}::uuid AND status IN ('new', 'discussed')
        `;
      }
      await logActivity(env, {
        brandId: brand.id,
        actorType: 'ai_agent',
        actorAgentId: agentId,
        action: 'seo.auto_published',
        entityType: 'content',
        entityId: contentId,
        afterState: {
          title: article.title,
          url,
          sourceKind: pick.candidate.kind,
          topic: pick.topic,
          reason: pick.reason,
        },
      });
      console.log(`[seo-auto] ${brand.slug} 已發布 ${url}`);
      return { ok: true, brand: brand.slug, title: article.title, url };
    } catch (err) {
      await sql`DELETE FROM contents WHERE id = ${contentId}::uuid`;
      throw err;
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[seo-auto] ${brand.slug} 未發布`, error);
    await logActivity(env, {
      brandId: brand.id,
      actorType: 'ai_agent',
      action: 'seo.auto_failed',
      entityType: 'content',
      afterState: { error: error.slice(0, 300), brand: brand.slug, topic: topicForLog || undefined },
    });
    return { ok: false, brand: brand.slug, error: error.slice(0, 300) };
  }
}
