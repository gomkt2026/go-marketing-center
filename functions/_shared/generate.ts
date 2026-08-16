import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson, generateImage } from './openai';
import {
  buildBrandContext, buildPostUserPrompt, buildEngagementEvalPrompt, getBrandVoice,
  HOMIGO_IG_IMAGE_STYLE, HOMIGO_TEXT_MARK_RULE,
  OFFTOPIC_SYSTEM_PROMPT, buildOfftopicUserPrompt,
  buildImageInspiredThreadsPrompt,
  ECOSYSTEM_X_SYSTEM_PROMPT, buildEcosystemXUserPrompt, ECOSYSTEM_X_IMAGE_STYLE,
  type BrandContext, type GeneratedPost, type EngagementPrediction,
  type GeneratedXPost, type EcosystemXAngle,
} from './prompts';
import { buildMediaKey, putMedia } from './media';
import { compositeLogo } from './watermark';
import { normalizeMultilineText } from './text';
import { X_TWEET_MAX_CHARS } from './x';

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
    /**
     * 跨品牌合作內容(見 prompts.ts 的 buildCollaborationContext),只在需要提及其他品牌時傳入。
     * 附加在 system prompt 之後,不寫回 brandCtx.systemPrompt,維持品牌知識邊界(Principle 2)。
     */
    collaborationContext?: string | null;
  },
): Promise<GenerationResult> {
  const { brandCtx, platform } = params;

  const userPrompt = buildPostUserPrompt({
    platform, topic: params.topic, topicSummary: params.topicSummary,
    extraInstruction: params.extraInstruction, brandSlug: brandCtx.slug,
  });
  const systemPrompt = params.collaborationContext
    ? `${brandCtx.systemPrompt}\n\n${params.collaborationContext}`
    : brandCtx.systemPrompt;
  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [
      { role: 'system', content: systemPrompt },
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
        { role: 'system', content: systemPrompt },
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

/**
 * Threads 生活哏文:跟品牌/服務完全無關的個人碎念(笑話/省思/感情觀三選一)。
 * 刻意不套用 brandCtx.systemPrompt(不帶品牌語氣與知識庫),只借 brandCtx.brandId 存檔用。
 * 不強制配圖:這類貼文用純文字表現最自然,才不會混進品牌視覺風格。
 */
export async function generateOfftopicPost(
  env: Env,
  params: { usedTopics: string[] },
): Promise<GenerationResult> {
  const userPrompt = buildOfftopicUserPrompt(params.usedTopics);
  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [
      { role: 'system', content: OFFTOPIC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
  });
  post.body = normalizeMultilineText(post.body);
  post.hashtags = [];
  post.imagePrompt = undefined;

  if (post.body.length > 500) {
    post = await chatCompleteJson<GeneratedPost>(env, {
      messages: [
        { role: 'system', content: OFFTOPIC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: JSON.stringify(post) },
        { role: 'user', content: `這篇 ${post.body.length} 字,超過 Threads 500 字上限。只保留一個核心重點,縮短到 500 字以內,回傳同格式 JSON。` },
      ],
      temperature: 0.7,
    });
    post.body = normalizeMultilineText(post.body);
    post.hashtags = [];
    post.imagePrompt = undefined;
  }

  const prediction = await chatCompleteJson<EngagementPrediction>(env, {
    messages: [
      { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
      { role: 'user', content: buildEngagementEvalPrompt({ platform: 'threads', body: post.body }) },
    ],
    temperature: 0.3,
  });

  return { post, prediction, imageUrl: null, imageError: null };
}

/**
 * Threads 圖片靈感貼文:用品牌智慧素材庫上傳的一張圖(系統畫面/實拍照片…)當話題,讓 AI 看圖寫貼文。
 * 不重新呼叫圖片生成 API,配圖直接沿用原本上傳的那張圖(省成本,也更真實)。
 */
export async function generateThreadsFromImage(
  env: Env,
  params: {
    brandCtx: BrandContext;
    imageUrl: string;
    caption?: string;
    imageCategory?: string;
  },
): Promise<GenerationResult> {
  const { brandCtx, imageUrl } = params;
  const userPrompt = buildImageInspiredThreadsPrompt({
    platform: 'threads', caption: params.caption, imageCategory: params.imageCategory, brandSlug: brandCtx.slug,
  });
  const visionUserMessage = {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: userPrompt },
      { type: 'image_url' as const, image_url: { url: imageUrl } },
    ],
  };

  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [{ role: 'system', content: brandCtx.systemPrompt }, visionUserMessage],
  });
  post.body = normalizeMultilineText(post.body);
  post.imagePrompt = undefined; // 配圖沿用原圖,不需要另外的圖片生成 prompt

  const brandThreadsMax = getBrandVoice(brandCtx.slug).threadsMaxChars;
  if (brandThreadsMax && post.body.length > brandThreadsMax) {
    post = await chatCompleteJson<GeneratedPost>(env, {
      messages: [
        { role: 'system', content: brandCtx.systemPrompt },
        visionUserMessage,
        { role: 'assistant', content: JSON.stringify(post) },
        { role: 'user', content: `這篇 ${post.body.length} 字,超過 ${brandThreadsMax} 字上限。請只保留一個核心重點,縮短到 ${brandThreadsMax} 字以內,回傳同格式 JSON。` },
      ],
      temperature: 0.5,
    });
    post.body = normalizeMultilineText(post.body);
    post.imagePrompt = undefined;
  }

  const prediction = await chatCompleteJson<EngagementPrediction>(env, {
    messages: [
      { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
      { role: 'user', content: buildEngagementEvalPrompt({ platform: 'threads', body: post.body }) },
    ],
    temperature: 0.3,
  });

  return { post, prediction, imageUrl, imageError: null };
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
    status?: 'draft' | 'pending_review' | 'published' | 'scheduled';
    /** 覆寫 content_assets.metadata;image_inspired 貼文用來標記「圖片沿用素材庫,不是本次生成」 */
    imageAssetMeta?: Record<string, unknown>;
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
              ${JSON.stringify(params.imageAssetMeta ?? { imagePrompt: result.post.imagePrompt ?? '', generated: true })})
    `;
  }

  return { contentId, versionId };
}

// ============================================================================
// Go 生態系 X(Twitter) 帳號內容生成
//   刻意不吃 BrandContext:素材只能來自 collaborationContext(見 prompts.ts 的
//   buildCollaborationContext),不得讀取任一品牌完整的 Brand Knowledge(Principle 2/3)。
// ============================================================================

export interface EcosystemXGenerationResult {
  post: GeneratedXPost;
  angleId: string;
  angleLabel: string;
  imageUrl: string | null;
  imageError: string | null;
}

/**
 * 生成 Go 生態系 X 貼文(單推或 thread);tweets 超字數上限時會要求模型重寫一次。
 * 同時依模型回傳的 imagePrompt + 固定的 ECOSYSTEM_X_IMAGE_STYLE 產一張科技感 hero image
 * (16:9,配合 X 卡片顯示比例),配圖失敗不影響文字貼文,只記錄 imageError。
 */
export async function generateEcosystemXPost(
  env: Env,
  params: { angle: EcosystemXAngle; collaborationContext: string },
): Promise<EcosystemXGenerationResult> {
  const userPrompt = buildEcosystemXUserPrompt({ angle: params.angle, collaborationContext: params.collaborationContext });
  const messages = [
    { role: 'system' as const, content: ECOSYSTEM_X_SYSTEM_PROMPT },
    { role: 'user' as const, content: userPrompt },
  ];
  let post = await chatCompleteJson<GeneratedXPost>(env, { messages, temperature: 0.7 });

  const overLimit = (p: GeneratedXPost) => !p.tweets?.length || p.tweets.some((t) => t.length > X_TWEET_MAX_CHARS);
  if (overLimit(post)) {
    post = await chatCompleteJson<GeneratedXPost>(env, {
      messages: [
        ...messages,
        { role: 'assistant', content: JSON.stringify(post) },
        {
          role: 'user',
          content: `Some tweets exceed ${X_TWEET_MAX_CHARS} characters (or the array was empty/invalid). ` +
            `Rewrite so every tweet is under ${X_TWEET_MAX_CHARS} characters. Return the same JSON format.`,
        },
      ],
      temperature: 0.5,
    });
  }
  post.tweets = (post.tweets ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 8);

  let imageUrl: string | null = null;
  let imageError: string | null = null;
  try {
    const scene = post.imagePrompt?.trim() || 'Three glowing data streams merging into a single pulsing core node.';
    const bytes = await generateImage(env, {
      prompt: `${scene} ${ECOSYSTEM_X_IMAGE_STYLE}`,
      size: '1536x1024',
      quality: 'medium',
    });
    const key = buildMediaKey('go-ecosystem', 'jpg');
    imageUrl = await putMedia(env, key, bytes, 'image/jpeg');
  } catch (e) {
    imageError = e instanceof Error ? e.message : '配圖生成失敗';
  }

  return { post, angleId: params.angle.id, angleLabel: params.angle.label, imageUrl, imageError };
}

export interface SavedEcosystemContent {
  contentId: string;
  versionId: string;
}

/**
 * 將 Go 生態系 X 貼文寫入 contents(collaboration 範圍,brand_id = NULL)/ content_versions。
 * Thread 的多則推文存成同一個 body,用 "\n---\n" 分隔,發布時(見 x.ts / scheduler)再切回陣列。
 */
export async function saveEcosystemXContent(
  env: Env,
  params: {
    collaborationId: string;
    result: EcosystemXGenerationResult;
    generatedByAgentId?: string | null;
    status?: 'draft' | 'pending_review' | 'published' | 'scheduled';
  },
): Promise<SavedEcosystemContent> {
  const sql = getSql(env);
  const { result } = params;
  const body = result.post.tweets.join('\n---\n');

  const contentRows = await sql`
    INSERT INTO contents (
      brand_id, collaboration_id, content_type, target_platform, title, status,
      generated_by_agent_id, generation_prompt_meta
    ) VALUES (
      NULL, ${params.collaborationId}::uuid, 'article', 'x',
      ${`[Go Ecosystem X] ${result.angleLabel}`}, ${params.status ?? 'pending_review'},
      ${params.generatedByAgentId ?? null},
      ${JSON.stringify({ source: 'ecosystem_x', angleId: result.angleId, format: result.post.format })}
    ) RETURNING id
  `;
  const contentId = (contentRows[0] as { id: string }).id;

  const versionRows = await sql`
    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta, generated_by_agent_id)
    VALUES (${contentId}::uuid, 1, ${body}, ${JSON.stringify([])}, '', ${params.generatedByAgentId ?? null})
    RETURNING id
  `;
  const versionId = (versionRows[0] as { id: string }).id;

  if (result.imageUrl) {
    await sql`
      INSERT INTO content_assets (content_version_id, asset_type, file_url, metadata)
      VALUES (${versionId}::uuid, 'image', ${result.imageUrl},
              ${JSON.stringify({ imagePrompt: result.post.imagePrompt ?? '', generated: true, source: 'ecosystem_x' })})
    `;
  }

  return { contentId, versionId };
}

export interface SeoArticleResult {
  title: string;
  body: string;
  outline: string[];
  faq: { q: string; a: string }[];
  cta: string;
  seoMeta: {
    title: string;
    description: string;
    keywords: string[];
    slug: string;
    canonicalHint: string;
  };
}

/** 從已核准報導或定稿新聞稿改寫 SEO 長文;不可整段複製原文 */
export async function generateSeoArticle(
  env: Env,
  params: {
    brandCtx: BrandContext;
    sourceTitle: string;
    sourceSummary: string;
    extraInstruction?: string;
  },
): Promise<SeoArticleResult> {
  const article = await chatCompleteJson<SeoArticleResult>(env, {
    messages: [
      {
        role: 'system',
        content: [
          params.brandCtx.systemPrompt,
          '',
          '你現在要寫一篇給官網/部落格的原創 SEO 長文,不是社群貼文。',
          '必須改寫,不可整段複製媒體原文或新聞稿。引用媒體時只帶出處 + 一句事實 + 原文 URL。',
          '不可發明媒體名稱、專訪、轉載數量或未經驗證的數據。',
          '繁體中文,800 到 1500 字,用 H2 小標分段,語氣像台灣產業觀察而不是新聞稿複讀。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `題目來源:${params.sourceTitle}`,
          params.sourceSummary,
          params.extraInstruction ?? '',
          '',
          '回傳 JSON:{"title":"文章標題","body":"正文(可用 markdown ## 小標)","outline":["H2 1","H2 2"],"faq":[{"q":"","a":""}],"cta":"結尾行動呼籲","seoMeta":{"title":"50-60字內 title","description":"120-160字 description","keywords":["關鍵字"],"slug":"英文或拼音 slug","canonicalHint":"建議放在哪個官網路徑"}}',
        ].filter(Boolean).join('\n'),
      },
    ],
    temperature: 0.6,
    maxTokens: 3500,
  });
  article.body = normalizeMultilineText(article.body);
  article.seoMeta = {
    title: article.seoMeta?.title || article.title,
    description: article.seoMeta?.description || article.body.slice(0, 140),
    keywords: article.seoMeta?.keywords ?? [],
    slug: article.seoMeta?.slug || 'article',
    canonicalHint: article.seoMeta?.canonicalHint || '',
  };
  return article;
}

export async function saveSeoArticle(
  env: Env,
  params: {
    brandCtx: BrandContext;
    article: SeoArticleResult;
    generatedByAgentId?: string | null;
    promptMeta?: Record<string, unknown>;
  },
): Promise<SavedContent> {
  const sql = getSql(env);
  const faqBlock = params.article.faq?.length
    ? `\n\n## FAQ\n${params.article.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}`
    : '';
  const body = `${params.article.body}${faqBlock}`;

  const contentRows = await sql`
    INSERT INTO contents (
      campaign_id, brand_id, content_type, target_platform, title, status,
      generated_by_agent_id, generation_prompt_meta
    ) VALUES (
      NULL, ${params.brandCtx.brandId}::uuid, 'article', NULL,
      ${params.article.title}, 'pending_review',
      ${params.generatedByAgentId ?? null},
      ${JSON.stringify(params.promptMeta ?? { source: 'seo_article' })}
    ) RETURNING id
  `;
  const contentId = (contentRows[0] as { id: string }).id;

  const versionRows = await sql`
    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta, seo_meta, generated_by_agent_id)
    VALUES (
      ${contentId}::uuid, 1, ${body}, ${JSON.stringify([])},
      ${params.article.cta ?? ''}, ${JSON.stringify(params.article.seoMeta)},
      ${params.generatedByAgentId ?? null}
    ) RETURNING id
  `;
  return { contentId, versionId: (versionRows[0] as { id: string }).id };
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

/** 找出「Go Ecosystem AI」Agent(brand_id = NULL,見 migration 009);生成內容的掛名者 */
export async function findEcosystemAgent(env: Env): Promise<string | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id FROM ai_agents a
    JOIN agent_roles r ON r.id = a.role_id
    WHERE a.brand_id IS NULL AND r.code = 'ecosystem_ai' AND a.is_active = true
    LIMIT 1
  `;
  return rows.length ? (rows[0] as { id: string }).id : null;
}
