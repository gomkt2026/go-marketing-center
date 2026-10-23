import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { rowToCamel } from '../../../../../_shared/case';
import { json, error } from '../../../../../_shared/response';
import { toClientError } from '../../../../../_shared/openai';
import { findBrandAgent, generateSeoArticle, saveSeoArticle } from '../../../../../_shared/generate';
import type { BrandContext } from '../../../../../_shared/prompts';
import { logActivity } from '../../../../../_shared/activity';
import { TASKGO_FILM_DEMO_LIMIT, seoTopicForFilmFeature } from '../../../../../_shared/taskgo-product-films';
import { seoTopicForShortFeature, systemShortFromMetadata, systemShortPrompt } from '../../../../../_shared/system-shorts';

// POST /api/brands/:slug/assets/:id/generate-seo
// 用素材庫這張產品截圖的說明，寫一篇待審官網長文。
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const assetId = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_assets
    WHERE id = ${assetId}::uuid AND brand_id = ${brand.id}::uuid AND asset_type = 'image'
    LIMIT 1
  `;
  if (!rows.length) return error('Asset not found', 404);
  const asset = rowToCamel<{
    id: string;
    name: string | null;
    caption: string | null;
    feature: string | null;
    usageContext: string | null;
  }>(rows[0] as Record<string, unknown>);
  if (!asset.caption && !asset.feature && !asset.name) {
    return error('這個素材還沒有說明，請先補上再產生長文', 400);
  }

  const fromShort = systemShortFromMetadata((rows[0] as { metadata?: unknown }).metadata);
  const topic = (fromShort ? seoTopicForShortFeature(slug, asset.feature) : undefined) ?? seoTopicForFilmFeature(asset.feature);
  const sourceTitle = topic?.topic || asset.feature || asset.name || '產品畫面';
  const sourceSummary = [
    asset.caption,
    asset.usageContext ? `畫面用途:${asset.usageContext}` : '',
    topic?.angle ?? '',
  ].filter(Boolean).join('\n');

  try {
    const brandCtx: BrandContext = {
      brandId: brand.id,
      slug: brand.slug,
      name: brand.name,
      systemPrompt: '',
    };
    const agentId = await findBrandAgent(context.env, brand.id);
    const article = await generateSeoArticle(context.env, {
      brandCtx,
      sourceTitle,
      sourceSummary,
      topicSeed: topic,
      extraInstruction: [
        '這篇依據品牌素材庫的產品短片截圖來寫，只寫說明裡真的有的功能。',
        fromShort ? systemShortPrompt(fromShort) : TASKGO_FILM_DEMO_LIMIT,
        asset.name ? `截圖名稱:${asset.name}` : '',
      ].filter(Boolean).join('\n'),
    });
    const { contentId } = await saveSeoArticle(context.env, {
      brandCtx,
      article,
      generatedByAgentId: agentId,
      promptMeta: {
        source: fromShort ? 'system_short' : 'product_film',
        shortId: fromShort?.id,
        topic: sourceTitle,
        angle: topic?.angle ?? asset.caption,
        assetId: asset.id,
        category: article.category,
        audience: article.audience,
      },
    });
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'content.generated',
      entityType: 'content',
      entityId: contentId,
      afterState: { type: 'seo_article', fromAsset: asset.id, topic: sourceTitle, platform: 'website' },
    });
    return json({ contentId, title: article.title, topic: sourceTitle }, 201);
  } catch (err) {
    const mapped = toClientError(err, '官網長文');
    const status = mapped.status >= 400 && mapped.status < 600 ? mapped.status : 502;
    return error(mapped.message, status);
  }
};
