import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../../_shared/env';
import { requireAuth } from '../../../../../../_shared/auth';
import { getSql } from '../../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../../_shared/queries';
import { json, error } from '../../../../../../_shared/response';
import { logActivity } from '../../../../../../_shared/activity';
import { buildBrandContext } from '../../../../../../_shared/prompts';
import { toPressCoverage, coverageTopicSummary } from '../../../../../../_shared/press';
import { generateSeoArticle, saveSeoArticle, findBrandAgent } from '../../../../../../_shared/generate';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM press_coverages WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到這則報導', 404);
  const coverage = toPressCoverage(rows[0] as Record<string, unknown>);
  if (coverage.status !== 'published' && coverage.status !== 'syndicated') {
    return error('只有已核准的報導才能生成 SEO 長文', 400);
  }

  const brandCtx = await buildBrandContext(context.env, brand.id);
  const agentId = await findBrandAgent(context.env, brand.id);
  const article = await generateSeoArticle(context.env, {
    brandCtx,
    sourceTitle: coverage.headline,
    sourceSummary: coverageTopicSummary(coverage),
    extraInstruction: '這是從已見報內容改寫的官網長文,不是轉貼媒體全文。',
  });
  const { contentId } = await saveSeoArticle(context.env, {
    brandCtx, article, generatedByAgentId: agentId,
    promptMeta: { source: 'press_coverage_seo', coverageId: id, outlet: coverage.outlet },
  });
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: agentId ? 'ai_agent' : 'user',
    actorAgentId: agentId,
    actorUserId: agentId ? null : auth.id,
    action: 'content.generated',
    entityType: 'content',
    entityId: contentId,
    afterState: { type: 'seo_article', fromPressCoverage: id },
  });
  return json({ contentId, title: article.title, seoMeta: article.seoMeta }, 201);
};
