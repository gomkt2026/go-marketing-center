import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson, generateImage } from './openai';
import {
  buildBrandContext, buildPostUserPrompt, buildEngagementEvalPrompt, getBrandVoice,
  HOMIGO_IG_IMAGE_STYLE, HOMIGO_TEXT_MARK_RULE,
  type BrandContext, type GeneratedPost, type EngagementPrediction,
} from './prompts';
import { buildMediaKey, putMedia } from './media';
import { compositeLogo } from './watermark';
import { normalizeMultilineText } from './text';

export type SocialPlatform = 'facebook' | 'instagram' | 'threads';

export const SUPPORTED_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'threads'];

/** 讀取品牌官方 logo(R2 brand-assets/{slug}/logo.png);沒有就回 null */
async function getBrandLogo(env: Env, brandSlug: string): Promise<Uint8Array | null> {
  if (!env.MEDIA) return null;
  try {
    const obj = await env.MEDIA.get(`brand-assets/${brandSlug}/logo.png`);
    if (!obj) return null;
    return new Uint8Array(await obj.arrayBuffer());
  } catch {
    return null;
  }
}

export interface GenerationResult {
  post: GeneratedPost;
  prediction: EngagementPrediction;
  imageUrl: string | null;
  imageError: string | null;
}

/** Threads 配圖每品牌每日上限(控制成本;以台灣時區的一天計) */
const THREADS_IMAGE_DAILY_CAP = 4;
/** 品牌專屬上限:Washgo 以「短文 + 可愛圖」衝曝光,每篇 Threads 都配圖 */
const THREADS_IMAGE_DAILY_CAP_BY_BRAND: Record<string, number> = { washgo: 10 };

async function threadsImageCountToday(env: Env, brandId: string): Promise<number> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT count(*)::int AS n
    FROM content_assets ca
    JOIN content_versions cv ON cv.id = ca.content_version_id
    JOIN contents c ON c.id = cv.content_id
    WHERE c.brand_id = ${brandId}::uuid
      AND c.target_platform = 'threads'
      AND ca.asset_type = 'image'
      AND ca.created_at >= date_trunc('day', now() + interval '8 hours') - interval '8 hours'
  `;
  return rows.length ? (rows[0] as { n: number }).n : 0;
}

/** 生成單一平台貼文 + 互動潛力評估 + 配圖(FB/IG 必配;Threads 由 AI 判斷且受每日上限) */
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

  // 修正模型偶發輸出的字面 \n(否則會原樣出現在貼文上)
  post.body = normalizeMultilineText(post.body);

  // 字數硬限制:FB 1000 字;Threads 依品牌設定(如 Washgo 150 字短文策略)。超過就要求縮短一次
  const brandThreadsMax = getBrandVoice(brandCtx.slug).threadsMaxChars;
  const hardLimit = platform === 'facebook' ? 1000
    : platform === 'threads' && brandThreadsMax ? brandThreadsMax
    : null;
  if (hardLimit && post.body.length > hardLimit) {
    post = await chatCompleteJson<GeneratedPost>(env, {
      messages: [
        { role: 'system', content: brandCtx.systemPrompt },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: JSON.stringify(post) },
        { role: 'user', content: `這篇 ${post.body.length} 字,超過 ${hardLimit} 字上限。請只保留一個核心重點,縮短到 ${hardLimit} 字以內,回傳同格式 JSON(imagePrompt 保留不變)。` },
      ],
      temperature: 0.5,
    });
    post.body = normalizeMultilineText(post.body);
  }

  const prediction = await chatCompleteJson<EngagementPrediction>(env, {
    messages: [
      { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
      { role: 'user', content: buildEngagementEvalPrompt({ platform, body: post.body }) },
    ],
    temperature: 0.3,
  });

  // FB / IG 貼文生成配圖;Threads 由 AI 判斷選填 imagePrompt 才產圖(每品牌每日上限控成本)
  // FB 走寫實攝影(橫式 1536x1024);IG 方形;Homigo IG 走 4:5 直式設計圖(防呆規範)
  // imageRendering = 'illustration' 的品牌(如 Washgo)全部走插畫風,不套 photorealistic
  // 品牌 logo 已上傳 R2(brand-assets/{slug}/logo.png)時,生成後由程式把「真 logo」合成到角落
  // (不再叫模型畫 logo:模型合成常把 logo 畫太大或裁出畫面外)
  let imageUrl: string | null = null;
  let imageError: string | null = null;
  let wantsImage = !!post.imagePrompt;
  if (wantsImage && platform === 'threads') {
    try {
      const cap = THREADS_IMAGE_DAILY_CAP_BY_BRAND[brandCtx.slug] ?? THREADS_IMAGE_DAILY_CAP;
      const used = await threadsImageCountToday(env, brandCtx.brandId);
      if (used >= cap) {
        wantsImage = false;
        console.log(`[generate] ${brandCtx.slug} Threads 今日配圖已達上限 ${cap},改純文字`);
      }
    } catch {
      wantsImage = false; // 計數失敗就保守不產圖
    }
  }
  if (wantsImage && post.imagePrompt) {
    try {
      const isFb = platform === 'facebook';
      const isHomigoIg = platform === 'instagram' && brandCtx.slug === 'homigo';
      const logo = await getBrandLogo(env, brandCtx.slug);
      // 台灣人臉孔身形與在地場景;FB 加寫實攝影質感;品牌可自帶紀實風格方向(如老屋紀實)
      const twPeople = 'any people shown are Taiwanese with East Asian facial features and natural everyday body types, authentic Taiwan daily-life setting';
      const voice = getBrandVoice(brandCtx.slug);
      const brandStyle = voice.imageStyle;
      const isIllustration = voice.imageRendering === 'illustration';
      const prompt = isHomigoIg
        ? `${post.imagePrompt}\n\n${HOMIGO_IG_IMAGE_STYLE}\n${logo
            ? '【品牌標】不要在圖上畫任何 logo 或品牌字樣;畫面左下角留乾淨,官方 logo 會在生成後由系統合成上去。'
            : HOMIGO_TEXT_MARK_RULE}`
        : isIllustration
          ? `${post.imagePrompt}. ${brandStyle ?? 'Warm hand-drawn illustration style.'} Any people shown are Taiwanese, authentic Taiwan daily-life setting. No text. No watermark. No logo.`
          : isFb
            ? `${post.imagePrompt}. Photorealistic candid documentary photography, natural lighting, warm tones, ${twPeople}, genuine emotions, shallow depth of field, shot on 35mm film, heartwarming and relatable.${brandStyle ? ` Style reference: ${brandStyle}` : ''} No text. No watermark. No logo.`
            : `${post.imagePrompt}. Warm and relatable, ${twPeople}.${brandStyle ? ` Style reference: ${brandStyle}` : ''} No text. No watermark. No logo.`;
      const size = isHomigoIg ? '1024x1536' as const : isFb ? '1536x1024' as const : '1024x1024' as const;
      // Homigo 設計圖要在圖上渲染繁中文字,用 high 品質防錯字
      const quality = isHomigoIg ? 'high' as const : 'medium' as const;
      let bytes = await generateImage(env, { prompt, size, quality });
      if (logo) {
        try {
          // Homigo IG 設計圖的 logo 放左下(footer);其他一律右下角
          bytes = compositeLogo(bytes, logo, { position: isHomigoIg ? 'bottom-left' : 'bottom-right' });
        } catch (e) {
          console.error('[generate] logo 合成失敗,改用無 logo 原圖', e);
        }
      }
      const key = buildMediaKey(brandCtx.slug, 'jpg');
      imageUrl = await putMedia(env, key, bytes, 'image/jpeg');
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
