import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';
import { buildBrandContext, SEO_TOPIC_BANK } from '../../../_shared/prompts';
import { generateSeoArticle, saveSeoArticle, findBrandAgent, pickSeoTopic } from '../../../_shared/generate';

// GET  /api/brands/:slug/seo-articles → 主題庫
// POST /api/brands/:slug/seo-articles → 從主題/簡報事實產 SEO 長文(不需先有媒體報導)

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  return json({ topics: SEO_TOPIC_BANK[slug] ?? [] });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    topic?: string;
    instruction?: string;
  };

  const sql = getSql(context.env);
  const usedRows = await sql`
    SELECT title FROM contents
    WHERE brand_id = ${brand.id}::uuid
      AND content_type = 'article'
      AND target_platform IS NULL
    ORDER BY created_at DESC
    LIMIT 20
  `;
  const usedTitles = (usedRows as { title: string | null }[]).map((r) => r.title ?? '');
  const picked = body.topic?.trim()
    ? { topic: body.topic.trim(), angle: body.instruction?.trim() || '依品牌事實寫給會搜這個詞的業者。' }
    : pickSeoTopic(slug, usedTitles);

  const brandCtx = await buildBrandContext(context.env, brand.id);
  const agentId = await findBrandAgent(context.env, brand.id);
  const article = await generateSeoArticle(context.env, {
    brandCtx,
    sourceTitle: picked.topic,
    sourceSummary: picked.angle,
    extraInstruction: [
      '這篇不是從媒體報導改寫,而是依品牌簡報與產品事實寫給業者搜尋的官網長文。',
      body.instruction && body.topic ? `補充指示:${body.instruction}` : '',
    ].filter(Boolean).join('\n'),
  });
  const { contentId } = await saveSeoArticle(context.env, {
    brandCtx, article, generatedByAgentId: agentId,
    promptMeta: { source: 'seo_topic', topic: picked.topic, angle: picked.angle },
  });
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: agentId ? 'ai_agent' : 'user',
    actorAgentId: agentId,
    actorUserId: agentId ? null : auth.id,
    action: 'content.generated',
    entityType: 'content',
    entityId: contentId,
    afterState: { type: 'seo_article', fromTopic: picked.topic },
  });
  return json({ contentId, title: article.title, seoMeta: article.seoMeta, topic: picked.topic }, 201);
};
