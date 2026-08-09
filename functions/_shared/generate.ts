import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson, generateImage } from './openai';
import {
  buildBrandContext, buildPostUserPrompt, buildEngagementEvalPrompt, getBrandVoice,
  HOMIGO_IG_IMAGE_STYLE,
  type BrandContext, type GeneratedPost, type EngagementPrediction,
} from './prompts';
import { buildMediaKey, putMedia } from './media';

export type SocialPlatform = 'facebook' | 'instagram' | 'threads';

export const SUPPORTED_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'threads'];

export interface GenerationResult {
  post: GeneratedPost;
  prediction: EngagementPrediction;
  imageUrl: string | null;
  imageError: string | null;
}

/** 生成單一平台貼文 + 互動潛力評估 + FB/IG 配圖 */
export async function generatePlatformPost(
  env: Env,
  params: {
    brandCtx: BrandContext;
    platform: SocialPlatform;
    topic: string;
    topicSummary?: string;
    extraInstruction?: string;
  },
): Promise<GenerationResult> {
  const { brandCtx, platform } = params;

  const userPrompt = buildPostUserPrompt({
    platform, topic: params.topic, topicSummary: params.topicSummary,
    extraInstruction: params.extraInstruction, brandSlug: brandCtx.slug,
  });
  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [
      { role: 'system', content: brandCtx.systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  // FB 硬限制 1000 字:超過就要求縮短一次
  if (platform === 'facebook' && post.body.length > 1000) {
    post = await chatCompleteJson<GeneratedPost>(env, {
      messages: [
        { role: 'system', content: brandCtx.systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: JSON.stringify(post) },
        { role: 'user', content: `這篇 ${post.body.length} 字,超過 1000 字上限。請保留故事核心,縮短到 1000 字以內,回傳同格式 JSON。` },
      ],
      temperature: 0.5,
    });
  }

  const prediction = await chatCompleteJson<EngagementPrediction>(env, {
    messages: [
      { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
      { role: 'user', content: buildEngagementEvalPrompt({ platform, body: post.body }) },
    ],
    temperature: 0.3,
  });

  // FB / IG 貼文生成配圖;失敗不阻擋文案產出
  // FB 走寫實攝影(橫式 1536x1024);IG 方形;Homigo IG 走 4:5 直式設計圖(防呆規範)
  let imageUrl: string | null = null;
  let imageError: string | null = null;
  if ((platform === 'facebook' || platform === 'instagram') && post.imagePrompt) {
    try {
      const isFb = platform === 'facebook';
      const isHomigoIg = platform === 'instagram' && brandCtx.slug === 'homigo';
      // 台灣人臉孔身形與在地場景;FB 加寫實攝影質感;品牌可自帶紀實風格方向(如老屋紀實)
      const twPeople = 'any people shown are Taiwanese with East Asian facial features and natural everyday body types, authentic Taiwan daily-life setting';
      const brandStyle = getBrandVoice(brandCtx.slug).imageStyle;
      const prompt = isHomigoIg
        ? `${post.imagePrompt}\n\n${HOMIGO_IG_IMAGE_STYLE}`
        : isFb
          ? `${post.imagePrompt}. Photorealistic candid documentary photography, natural lighting, warm tones, ${twPeople}, genuine emotions, shallow depth of field, shot on 35mm film, heartwarming and relatable.${brandStyle ? ` Style reference: ${brandStyle}` : ''} No text, no watermark.`
          : `${post.imagePrompt}. Warm and relatable, ${twPeople}.${brandStyle ? ` Style reference: ${brandStyle}` : ''} No text, no watermark.`;
      const size = isHomigoIg ? '1024x1536' as const : isFb ? '1536x1024' as const : '1024x1024' as const;
      // Homigo 設計圖要在圖上渲染繁中文字,用 high 品質防錯字
      const bytes = await generateImage(env, { prompt, size, quality: isHomigoIg ? 'high' : 'medium' });
      const key = buildMediaKey(brandCtx.slug);
      imageUrl = await putMedia(env, key, bytes);
    } catch (e) {
      imageError = e instanceof Error ? e.message : '圖片生成失敗';
    }
  }

  return { post, prediction, imageUrl, imageError };
}

export interface SavedContent {
  contentId: string;
  versionId: string;
}

/** 將生成結果寫入 contents / content_versions / content_assets */
export async function saveGeneratedContent(
  env: Env,
  params: {
    brandCtx: BrandContext;
    platform: SocialPlatform;
    result: GenerationResult;
    sourceMarketSignalId?: string | null;
    campaignId?: string | null;
    generatedByAgentId?: string | null;
    promptMeta?: Record<string, unknown>;
    status?: 'draft' | 'pending_review' | 'published';
  },
): Promise<SavedContent> {
  const sql = getSql(env);
  const { result, platform, brandCtx } = params;

  const contentType = platform === 'instagram' ? 'image' : 'article';
  const contentRows = await sql`
    INSERT INTO contents (
      campaign_id, brand_id, content_type, target_platform, title, status,
      generated_by_agent_id, predicted_engagement_score, engagement_analysis,
      generation_prompt_meta, source_market_signal_id
    ) VALUES (
      ${params.campaignId ?? null}, ${brandCtx.brandId}::uuid, ${contentType}, ${platform},
      ${result.post.title}, ${params.status ?? 'pending_review'},
      ${params.generatedByAgentId ?? null},
      ${Math.max(0, Math.min(100, result.prediction.score))},
      ${result.prediction.analysis + (result.prediction.suggestions.length ? `\n改進建議:\n- ${result.prediction.suggestions.join('\n- ')}` : '')},
      ${JSON.stringify(params.promptMeta ?? {})},
      ${params.sourceMarketSignalId ?? null}
    ) RETURNING id
  `;
  const contentId = (contentRows[0] as { id: string }).id;

  const versionRows = await sql`
    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta, generated_by_agent_id)
    VALUES (${contentId}::uuid, 1, ${result.post.body}, ${JSON.stringify(result.post.hashtags ?? [])},
            ${result.post.cta ?? ''}, ${params.generatedByAgentId ?? null})
    RETURNING id
  `;
  const versionId = (versionRows[0] as { id: string }).id;

  if (result.imageUrl) {
    await sql`
      INSERT INTO content_assets (content_version_id, asset_type, file_url, metadata)
      VALUES (${versionId}::uuid, 'image', ${result.imageUrl},
              ${JSON.stringify({ imagePrompt: result.post.imagePrompt ?? '', generated: true })})
    `;
  }

  return { contentId, versionId };
}

/** 找出品牌的 brand_ai Agent(生成內容的掛名者) */
export async function findBrandAgent(env: Env, brandId: string): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE a.brand_id = ${brandId}::uuid AND a.is_active = true
    ORDER BY (r.code = 'brand_ai') DESC
    LIMIT 1
  `;
  return rows.length ? (rows[0] as { id: string }).id : null;
}
