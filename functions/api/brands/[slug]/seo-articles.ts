import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';
import { buildBrandContext } from '../../../_shared/prompts';
import { generateSeoArticle, saveSeoArticle, findBrandAgent, pickSeoTopicFromList } from '../../../_shared/generate';
import {
  annotateSeoTopics,
  discoverNewSeoTopics,
  listSeoTopicsForBrand,
  MAX_RECOMMENDED_SEO_ARTICLES,
  recommendedSeoTopics,
} from '../../../_shared/seo-topics';

// GET  /api/brands/:slug/seo-articles → 主題庫（含是否已有長文）
// POST /api/brands/:slug/seo-articles → 搜尋新文章，或產一篇還沒覆蓋的官網長文

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const bank = await listSeoTopicsForBrand(context.env, brand.id, slug);
  const topics = await annotateSeoTopics(context.env, brand.id, bank);
  return json({
    topics,
    recommended: recommendedSeoTopics(topics),
    maxRecommended: MAX_RECOMMENDED_SEO_ARTICLES,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    action?: string;
    topic?: string;
    instruction?: string;
  };

  if (body.action === 'discover') {
    try {
      const result = await discoverNewSeoTopics(context.env, brand);
      return json({
        topics: result.topics,
        recommended: recommendedSeoTopics(result.topics),
        discovered: result.discovered,
        siteTitles: result.siteTitles,
        maxRecommended: MAX_RECOMMENDED_SEO_ARTICLES,
      });
    } catch (err) {
      return error(err instanceof Error ? err.message : '搜尋新文章失敗', 500);
    }
  }

  const sql = getSql(context.env);
  const usedRows = await sql`
    SELECT title FROM contents
    WHERE brand_id = ${brand.id}::uuid
      AND content_type = 'article'
      AND (target_platform IS NULL OR target_platform = 'website')
    ORDER BY created_at DESC
    LIMIT 20
  `;
  const usedTitles = (usedRows as { title: string | null }[]).map((r) => r.title ?? '');
  const bank = await listSeoTopicsForBrand(context.env, brand.id, slug);
  const annotated = await annotateSeoTopics(context.env, brand.id, bank);
  const open = recommendedSeoTopics(annotated);

  if (body.topic?.trim()) {
    const pickedTopic = annotated.find((t) => t.topic === body.topic?.trim());
    if (pickedTopic?.coverage === 'published') {
      return error(`這題已有長文「${pickedTopic.matchedTitle}」，請改按「搜尋新文章」找還沒寫過的題。`, 409);
    }
    if (pickedTopic?.coverage === 'draft') {
      return error(`這題在內容中心已有草稿「${pickedTopic.matchedTitle}」，請先審閱發布，不要再產一篇。`, 409);
    }
  }

  const picked = body.topic?.trim()
    ? (bank.find((t) => t.topic === body.topic?.trim()) ?? {
      topic: body.topic.trim(),
      angle: body.instruction?.trim() || '依品牌事實寫給會搜這個詞的讀者。',
    })
    : (open[0] ?? pickSeoTopicFromList(bank, usedTitles));

  const brandCtx = await buildBrandContext(context.env, brand.id);
  const agentId = await findBrandAgent(context.env, brand.id);
  const article = await generateSeoArticle(context.env, {
    brandCtx,
    sourceTitle: picked.topic,
    sourceSummary: picked.angle,
    topicSeed: picked,
    extraInstruction: [
      '這篇是官網長文,給 Google / AI 搜尋收錄,不是社群貼文。',
      body.instruction && body.topic ? `補充指示:${body.instruction}` : '',
    ].filter(Boolean).join('\n'),
  });
  const { contentId } = await saveSeoArticle(context.env, {
    brandCtx, article, generatedByAgentId: agentId,
    promptMeta: {
      source: 'seo_topic',
      topic: picked.topic,
      angle: picked.angle,
      category: article.category,
      audience: article.audience,
    },
  });
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: agentId ? 'ai_agent' : 'user',
    actorAgentId: agentId,
    actorUserId: agentId ? null : auth.id,
    action: 'content.generated',
    entityType: 'content',
    entityId: contentId,
    afterState: { type: 'seo_article', fromTopic: picked.topic, platform: 'website' },
  });
  return json({ contentId, title: article.title, seoMeta: article.seoMeta, topic: picked.topic }, 201);
};
