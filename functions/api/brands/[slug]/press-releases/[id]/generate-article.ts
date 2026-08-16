import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import { buildBrandContext } from '../../../../../_shared/prompts';
import { generateSeoArticle, saveSeoArticle, findBrandAgent } from '../../../../../_shared/generate';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM press_releases WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到這則新聞稿', 404);
  const release = rows[0] as { title: string; body: string; status: string };
  if (release.status !== 'final' && release.status !== 'approved') {
    return error('需先審核通過或定稿,才能生成 SEO 長文', 400);
  }

  const brandCtx = await buildBrandContext(context.env, brand.id);
  const agentId = await findBrandAgent(context.env, brand.id);
  const article = await generateSeoArticle(context.env, {
    brandCtx,
    sourceTitle: release.title,
    sourceSummary: release.body.slice(0, 2000),
    extraInstruction: '來源是自家新聞稿。改寫成官網長文,不可整段複製,也不可寫成「已被媒體報導」。',
  });
  const { contentId } = await saveSeoArticle(context.env, {
    brandCtx, article, generatedByAgentId: agentId,
    promptMeta: { source: 'press_release_seo', releaseId: id },
  });
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: agentId ? 'ai_agent' : 'user',
    actorAgentId: agentId,
    actorUserId: agentId ? null : auth.id,
    action: 'content.generated',
    entityType: 'content',
    entityId: contentId,
    afterState: { type: 'seo_article', fromPressRelease: id },
  });
  return json({ contentId, title: article.title, seoMeta: article.seoMeta }, 201);
};
