import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson, generateImage, generateImageWithReference } from './openai';
import {
  buildBrandContext, buildPostUserPrompt, buildEngagementEvalPrompt, getBrandVoice,
  HOMIGO_TEXT_MARK_RULE, BRAND_DESIGN_IMAGE_STYLE, SYSTEM_SCREENSHOT_POSTER_RULE,
  OFFTOPIC_SYSTEM_PROMPT, buildOfftopicUserPrompt,
  buildImageInspiredPostPrompt,
  ECOSYSTEM_X_SYSTEM_PROMPT, buildEcosystemXUserPrompt, ECOSYSTEM_X_IMAGE_STYLE,
  defaultAudienceLane, pickAudience, pickImageStyle, audienceLaneInstruction, SHARED_BRAND_CTA,
  SEO_TOPIC_BANK, brandSeoFacts,
  type BrandContext, type GeneratedPost, type EngagementPrediction,
  type GeneratedXPost, type EcosystemXAngle,
  type AudienceLane, type ImageStyleId,
} from './prompts';
import { buildMediaKey, getMediaBytes, mediaUrlToKey, putMedia, toPublicMediaUrl } from './media';
import { compositeLogo } from './watermark';
import { frameScreenshotForIg } from './ig-frame';
import { normalizeMultilineText } from './text';
import { X_TWEET_MAX_CHARS } from './x';

export type SocialPlatform = 'facebook' | 'instagram' | 'threads';

export const SUPPORTED_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'threads'];

/** IG 最多 12、FB 最多 3;Threads 只去 # 不硬切(品牌規則各自處理) */
function clampHashtags(tags: string[] | undefined, platform: SocialPlatform): string[] {
  const cleaned = (tags ?? []).map((h) => h.replace(/^#/, '').trim()).filter(Boolean);
  if (platform === 'instagram') return cleaned.slice(0, 12);
  if (platform === 'facebook') return cleaned.slice(0, 3);
  return cleaned;
}

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
  audienceLane?: AudienceLane;
  audienceName?: string | null;
  imageSource?: 'asset' | 'generated' | null;
  imageStyle?: ImageStyleId | null;
  assetId?: string | null;
}

export interface BrandAssetPick {
  id: string;
  fileUrl: string;
  caption: string | null;
  imageCategory: string | null;
}

function toAssetPick(env: Env, row: { id: string; file_url: string | null; caption: string | null; image_category: string | null }): BrandAssetPick | null {
  const fileUrl = toPublicMediaUrl(env, row.file_url);
  if (!fileUrl) return null;
  return { id: row.id, fileUrl, caption: row.caption, imageCategory: row.image_category };
}

export async function pickBrandAsset(env: Env, brandId: string, preferScreenshot = false): Promise<BrandAssetPick | null> {
  const sql = getSql(env);
  if (preferScreenshot) {
    const shots = await sql`
      SELECT id, file_url, caption, image_category FROM brand_assets
      WHERE brand_id = ${brandId}::uuid AND asset_type = 'image' AND image_category = 'system_screenshot'
      ORDER BY used_in_threads_count ASC, last_used_at ASC NULLS FIRST
      LIMIT 1
    `;
    if (shots.length) return toAssetPick(env, shots[0] as { id: string; file_url: string | null; caption: string | null; image_category: string | null });
    // B 端不要退回吉卜力/生活插畫素材庫,沒有系統畫面就走簡報風生圖
    return null;
  }
  const rows = await sql`
    SELECT id, file_url, caption, image_category FROM brand_assets
    WHERE brand_id = ${brandId}::uuid AND asset_type = 'image'
    ORDER BY
      CASE image_category
        WHEN 'system_screenshot' THEN 0
        WHEN 'real_photo' THEN 1
        WHEN 'scene' THEN 2
        WHEN 'people' THEN 3
        ELSE 4
      END,
      used_in_threads_count ASC, last_used_at ASC NULLS FIRST
    LIMIT 1
  `;
  if (!rows.length) return null;
  return toAssetPick(env, rows[0] as { id: string; file_url: string | null; caption: string | null; image_category: string | null });
}

export async function pickBrandScreenshot(env: Env, brandSlug: string): Promise<BrandAssetPick | null> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT a.id, a.file_url, a.caption, a.image_category
    FROM brand_assets a
    JOIN brands b ON b.id = a.brand_id
    WHERE b.slug = ${brandSlug} AND a.asset_type = 'image' AND a.image_category = 'system_screenshot'
    ORDER BY a.used_in_threads_count ASC, a.last_used_at ASC NULLS FIRST
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0] as { id: string; file_url: string | null; caption: string | null; image_category: string | null };
  const fileUrl = toPublicMediaUrl(env, row.file_url);
  if (!fileUrl) return null;
  return { id: row.id, fileUrl, caption: row.caption, imageCategory: row.image_category };
}

function isSystemScreenshot(asset: { imageCategory?: string | null } | null | undefined): boolean {
  return asset?.imageCategory === 'system_screenshot';
}

async function loadAssetBytes(env: Env, fileUrl: string): Promise<Uint8Array | null> {
  const key = mediaUrlToKey(fileUrl);
  if (!key) return null;
  return getMediaBytes(env, key);
}

/** 把真實系統截圖做成 B 端痛點海報;失敗回 null 讓呼叫端退回簡報框原圖 */
async function generateSystemScreenshotPoster(
  env: Env,
  params: {
    brandSlug: string;
    platform: SocialPlatform;
    imagePrompt?: string | null;
    screenshotUrl: string;
  },
): Promise<string | null> {
  try {
    const ref = await loadAssetBytes(env, params.screenshotUrl);
    if (!ref) return null;
    const isFb = params.platform === 'facebook';
    const isIg = params.platform === 'instagram';
    const designSpec = BRAND_DESIGN_IMAGE_STYLE[params.brandSlug] ?? BRAND_DESIGN_IMAGE_STYLE.homigo;
    const logo = await getBrandLogo(env, params.brandSlug);
    const headlineHint = params.imagePrompt?.trim()
      || 'B2B pain-point poster with a 4-10 character Traditional Chinese headline.';
    const prompt = [
      headlineHint,
      designSpec,
      SYSTEM_SCREENSHOT_POSTER_RULE,
      logo
        ? 'Do not draw any logo or brand wordmark; leave a clean corner for the official logo composite.'
        : params.brandSlug === 'homigo' ? HOMIGO_TEXT_MARK_RULE : '',
    ].filter(Boolean).join('\n\n');
    const size = isFb ? '1536x1024' as const : isIg ? '1024x1536' as const : '1024x1024' as const;
    let bytes = await generateImageWithReference(env, {
      prompt, reference: ref, size, quality: 'high', inputFidelity: 'high',
    });
    if (logo) {
      try {
        bytes = compositeLogo(bytes, logo, {
          position: isIg && params.brandSlug === 'homigo' ? 'bottom-left' : 'bottom-right',
        });
      } catch (e) {
        console.error('[generate] 海報 logo 合成失敗,沿用無 logo 原圖', e);
      }
    }
    const key = buildMediaKey(params.brandSlug, 'jpg');
    return await putMedia(env, key, bytes, 'image/jpeg');
  } catch (e) {
    console.error('[generate] 系統畫面海報生成失敗,改用簡報框原圖', e);
    return null;
  }
}

/** 從素材庫網址取出 bytes,包成 IG 4:5 JPEG 後寫回 R2;失敗回 null 讓呼叫端沿用原圖 */
async function frameAssetForInstagram(env: Env, brandSlug: string, fileUrl: string): Promise<string | null> {
  const key = mediaUrlToKey(fileUrl);
  if (!key) return null;
  try {
    const bytes = await getMediaBytes(env, key);
    if (!bytes) return null;
    const framed = frameScreenshotForIg(bytes, brandSlug);
    const outKey = buildMediaKey(brandSlug, 'jpg');
    return await putMedia(env, outKey, framed, 'image/jpeg');
  } catch (e) {
    console.error('[generate] IG 系統畫面框失敗,沿用原圖', e);
    return null;
  }
}

export async function markAssetUsed(env: Env, assetId: string): Promise<void> {
  const sql = getSql(env);
  await sql`
    UPDATE brand_assets SET used_in_threads_count = used_in_threads_count + 1, last_used_at = now()
    WHERE id = ${assetId}::uuid
  `;
}

async function recentImageStyles(env: Env, brandId: string): Promise<ImageStyleId[]> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT generation_prompt_meta->>'imageStyle' AS style FROM contents
    WHERE brand_id = ${brandId}::uuid
      AND generation_prompt_meta->>'imageSource' = 'generated'
      AND generation_prompt_meta->>'imageStyle' IS NOT NULL
    ORDER BY created_at DESC LIMIT 2
  `;
  return (rows as { style: string | null }[])
    .map((r) => r.style)
    .filter((s): s is ImageStyleId => s === 'photo' || s === 'design' || s === 'illustration');
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
    audienceLane?: AudienceLane;
    audienceName?: string;
    /** 不查素材庫、一律走 AI 生圖(測試或明確要求時) */
    skipAssetLookup?: boolean;
  },
): Promise<GenerationResult> {
  const { brandCtx, platform } = params;
  const lane = params.audienceLane ?? defaultAudienceLane(platform);
  const audience = params.audienceName
    ? { name: params.audienceName, lane, painPoints: [], appealAngle: null }
    : await pickAudience(env, brandCtx.brandId, brandCtx.slug, lane);

  let reusedAsset: BrandAssetPick | null = null;
  // B 端 FB/IG 優先取真實系統畫面當素材,但要做成痛點海報,不是整頁截圖直發。
  // Threads 本來就不走素材庫。
  if (!params.skipAssetLookup && (platform === 'facebook' || platform === 'instagram')) {
    try {
      reusedAsset = await pickBrandAsset(env, brandCtx.brandId, lane === 'b2b');
    } catch (e) {
      console.error('[generate] 素材庫查詢失敗,改走生圖', e);
    }
  }

  const screenshotPoster = !!(reusedAsset && isSystemScreenshot(reusedAsset)
    && (platform === 'facebook' || platform === 'instagram'));
  const reusePhotoAsIs = !!reusedAsset && !screenshotPoster;
  const recentStyles = reusePhotoAsIs ? [] : await recentImageStyles(env, brandCtx.brandId).catch(() => [] as ImageStyleId[]);
  const imageStyle = screenshotPoster
    ? 'design' as const
    : reusePhotoAsIs
      ? null
      : pickImageStyle({ platform, lane, brandSlug: brandCtx.slug, recentStyles });

  const userPrompt = buildPostUserPrompt({
    platform, topic: params.topic, topicSummary: params.topicSummary,
    extraInstruction: [
      params.extraInstruction ?? '',
      screenshotPoster
        ? `本篇會用品牌上傳的系統畫面「${reusedAsset?.caption ?? '後台截圖'}」做成痛點海報。文案要對得上這張真實畫面。`
        : reusedAsset
          ? `本篇配圖已指定為品牌上傳的「${reusedAsset.imageCategory ?? '素材'}」${reusedAsset.caption ? `:${reusedAsset.caption}` : ''}。文案要對得上這張真實畫面,不要另外要 imagePrompt。`
          : '',
    ].filter(Boolean).join('\n'),
    brandSlug: brandCtx.slug,
    audienceLane: lane,
    audienceName: audience.name,
    imageStyle: imageStyle ?? undefined,
    skipImagePrompt: reusePhotoAsIs,
    screenshotPoster,
  });
  const systemPrompt = params.collaborationContext
    ? `${brandCtx.systemPrompt}\n\n${audienceLaneInstruction(brandCtx.slug, lane)}\n\n${params.collaborationContext}`
    : `${brandCtx.systemPrompt}\n\n${audienceLaneInstruction(brandCtx.slug, lane)}`;
  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  // 修正模型偶發輸出的字面 \n(否則會原樣出現在貼文上)
  post.body = normalizeMultilineText(post.body);
  post.hashtags = clampHashtags(post.hashtags, platform);
  post.cta = SHARED_BRAND_CTA;

  // 字數硬限制:FB 1000 字;IG 依品牌(預設 220);Threads 依品牌設定(如 Washgo 150 字短文策略)
  const brandVoice = getBrandVoice(brandCtx.slug);
  const hardLimit = platform === 'facebook' ? 1000
    : platform === 'instagram' ? (brandVoice.instagramMaxChars ?? 220)
    : platform === 'threads' && brandVoice.threadsMaxChars ? brandVoice.threadsMaxChars
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
    post.hashtags = clampHashtags(post.hashtags, platform);
  }
  post.cta = SHARED_BRAND_CTA;
  post.hashtags = clampHashtags(post.hashtags, platform);

  const prediction = await chatCompleteJson<EngagementPrediction>(env, {
    messages: [
      { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
      { role: 'user', content: buildEngagementEvalPrompt({ platform, body: post.body }) },
    ],
    temperature: 0.3,
  });

  if (screenshotPoster && reusedAsset) {
    const posterUrl = await generateSystemScreenshotPoster(env, {
      brandSlug: brandCtx.slug,
      platform,
      imagePrompt: post.imagePrompt,
      screenshotUrl: reusedAsset.fileUrl,
    });
    if (posterUrl) {
      return {
        post, prediction, imageUrl: posterUrl, imageError: null,
        audienceLane: lane, audienceName: audience.name,
        imageSource: 'generated', imageStyle: 'design', assetId: reusedAsset.id,
      };
    }
    const fallbackUrl = platform === 'instagram'
      ? await frameAssetForInstagram(env, brandCtx.slug, reusedAsset.fileUrl) ?? reusedAsset.fileUrl
      : reusedAsset.fileUrl;
    return {
      post, prediction, imageUrl: fallbackUrl, imageError: '系統畫面海報生成失敗,改用簡報框原圖',
      audienceLane: lane, audienceName: audience.name,
      imageSource: 'asset', imageStyle: null, assetId: reusedAsset.id,
    };
  }

  if (reusedAsset) {
    post.imagePrompt = undefined;
    const imageUrl = platform === 'instagram'
      ? await frameAssetForInstagram(env, brandCtx.slug, reusedAsset.fileUrl) ?? reusedAsset.fileUrl
      : reusedAsset.fileUrl;
    return {
      post, prediction, imageUrl, imageError: null,
      audienceLane: lane, audienceName: audience.name,
      imageSource: 'asset', imageStyle: null, assetId: reusedAsset.id,
    };
  }

  // FB / IG 貼文生成配圖;Threads 由 AI 判斷選填 imagePrompt 才產圖(每品牌每日上限控成本)
  // 風格依 imageStyle 輪替:photo / design / illustration。Washgo 不再全平台鎖插畫。
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
      wantsImage = false;
    }
  }
  if (wantsImage && post.imagePrompt) {
    try {
      const isFb = platform === 'facebook';
      const style = imageStyle ?? 'photo';
      const isDesign = style === 'design';
      const isIllustration = style === 'illustration';
      const logo = await getBrandLogo(env, brandCtx.slug);
      const twPeople = 'any people shown are Taiwanese with East Asian facial features and natural everyday body types, authentic Taiwan daily-life setting';
      const voice = getBrandVoice(brandCtx.slug);
      const photoRef = (lane === 'b2b' && voice.imageStyleB2b) ? voice.imageStyleB2b : voice.imageStyle;
      const designSpec = BRAND_DESIGN_IMAGE_STYLE[brandCtx.slug] ?? BRAND_DESIGN_IMAGE_STYLE.homigo;
      const photoBase = brandCtx.slug === 'taskgo'
        ? `Photorealistic professional construction-tech photography in Taiwan, bright daylight, navy-cyan color grade, ${twPeople}, workers in hard hats and reflective vests using a tablet or LINE on site, shallow depth of field. Not film nostalgia, not Western stock-model look.`
        : `Photorealistic candid documentary photography, natural lighting, warm tones, ${twPeople}, genuine emotions, shallow depth of field, shot on 35mm film, heartwarming and relatable.`;
      const prompt = isDesign
        ? `${post.imagePrompt}\n\n${designSpec}\n${logo
            ? '【品牌標】不要在圖上畫任何 logo 或品牌字樣;畫面角落留乾淨,官方 logo 會在生成後由系統合成上去。'
            : brandCtx.slug === 'homigo' ? HOMIGO_TEXT_MARK_RULE : ''}`
        : isIllustration
          ? `${post.imagePrompt}. ${voice.imageStyle ?? 'Warm hand-drawn illustration style.'} Any people shown are Taiwanese, authentic Taiwan daily-life setting. No text. No watermark. No logo.`
          : `${post.imagePrompt}. ${photoBase}${photoRef ? ` Style reference: ${photoRef}` : ''} No text. No watermark. No logo.`;
      const isIg = platform === 'instagram';
      const size = isFb ? '1536x1024' as const : isIg ? '1024x1536' as const : isDesign ? '1024x1536' as const : '1024x1024' as const;
      const quality = isDesign ? 'high' as const : 'medium' as const;
      let bytes = await generateImage(env, { prompt, size, quality });
      if (logo) {
        try {
          bytes = compositeLogo(bytes, logo, { position: isDesign && brandCtx.slug === 'homigo' ? 'bottom-left' : 'bottom-right' });
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

  return {
    post, prediction, imageUrl, imageError,
    audienceLane: lane, audienceName: audience.name,
    imageSource: imageUrl ? 'generated' : null, imageStyle, assetId: null,
  };
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
 * 看圖寫貼文:用品牌智慧素材庫上傳的一張圖當話題,配圖沿用原圖。
 * FB/IG 預設 B 端,Threads 預設 C 端。
 */
export async function generatePostFromImage(
  env: Env,
  params: {
    brandCtx: BrandContext;
    platform: SocialPlatform;
    imageUrl: string;
    caption?: string;
    imageCategory?: string;
    audienceLane?: AudienceLane;
    audienceName?: string;
    assetId?: string;
    extraInstruction?: string;
  },
): Promise<GenerationResult> {
  const { brandCtx, imageUrl, platform } = params;
  const lane = params.audienceLane ?? defaultAudienceLane(platform);
  const audienceName = params.audienceName ?? (await pickAudience(env, brandCtx.brandId, brandCtx.slug, lane)).name;
  const userPrompt = buildImageInspiredPostPrompt({
    platform, caption: params.caption, imageCategory: params.imageCategory,
    brandSlug: brandCtx.slug, audienceLane: lane, audienceName,
    extraInstruction: params.extraInstruction,
  });
  const systemPrompt = `${brandCtx.systemPrompt}\n\n${audienceLaneInstruction(brandCtx.slug, lane)}`;
  const visionUserMessage = {
    role: 'user' as const,
    content: [
      { type: 'text' as const, text: userPrompt },
      { type: 'image_url' as const, image_url: { url: imageUrl } },
    ],
  };

  const screenshotPoster = params.imageCategory === 'system_screenshot'
    && (platform === 'facebook' || platform === 'instagram');
  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [{ role: 'system', content: systemPrompt }, visionUserMessage],
  });
  post.body = normalizeMultilineText(post.body);
  if (!screenshotPoster) post.imagePrompt = undefined;
  post.hashtags = clampHashtags(post.hashtags, platform);
  post.cta = SHARED_BRAND_CTA;

  const brandVoice = getBrandVoice(brandCtx.slug);
  const hardLimit = platform === 'facebook' ? 1000
    : platform === 'instagram' ? (brandVoice.instagramMaxChars ?? 220)
    : platform === 'threads' && brandVoice.threadsMaxChars ? brandVoice.threadsMaxChars
    : null;
  if (hardLimit && post.body.length > hardLimit) {
    post = await chatCompleteJson<GeneratedPost>(env, {
      messages: [
        { role: 'system', content: systemPrompt },
        visionUserMessage,
        { role: 'assistant', content: JSON.stringify(post) },
        { role: 'user', content: `這篇 ${post.body.length} 字,超過 ${hardLimit} 字上限。請只保留一個核心重點,縮短到 ${hardLimit} 字以內,回傳同格式 JSON。` },
      ],
      temperature: 0.5,
    });
    post.body = normalizeMultilineText(post.body);
    if (!screenshotPoster) post.imagePrompt = undefined;
    post.hashtags = clampHashtags(post.hashtags, platform);
  }
  post.cta = SHARED_BRAND_CTA;
  post.hashtags = clampHashtags(post.hashtags, platform);

  const prediction = await chatCompleteJson<EngagementPrediction>(env, {
    messages: [
      { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
      { role: 'user', content: buildEngagementEvalPrompt({ platform, body: post.body }) },
    ],
    temperature: 0.3,
  });

  if (screenshotPoster) {
    const posterUrl = await generateSystemScreenshotPoster(env, {
      brandSlug: brandCtx.slug,
      platform,
      imagePrompt: post.imagePrompt,
      screenshotUrl: imageUrl,
    });
    if (posterUrl) {
      return {
        post, prediction, imageUrl: posterUrl, imageError: null,
        audienceLane: lane, audienceName, imageSource: 'generated', imageStyle: 'design',
        assetId: params.assetId ?? null,
      };
    }
  }

  const framedUrl = platform === 'instagram'
    ? await frameAssetForInstagram(env, brandCtx.slug, imageUrl) ?? imageUrl
    : imageUrl;

  return {
    post, prediction, imageUrl: framedUrl, imageError: null,
    audienceLane: lane, audienceName, imageSource: 'asset', imageStyle: null,
    assetId: params.assetId ?? null,
  };
}

/** Threads 看圖寫文(相容舊呼叫) */
export async function generateThreadsFromImage(
  env: Env,
  params: {
    brandCtx: BrandContext;
    imageUrl: string;
    caption?: string;
    imageCategory?: string;
    assetId?: string;
  },
): Promise<GenerationResult> {
  return generatePostFromImage(env, { ...params, platform: 'threads' });
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
      ${JSON.stringify({
        ...params.promptMeta,
        audienceLane: params.promptMeta?.audienceLane ?? result.audienceLane,
        audienceName: params.promptMeta?.audienceName ?? result.audienceName,
        imageSource: params.promptMeta?.imageSource ?? result.imageSource,
        imageStyle: params.promptMeta?.imageStyle ?? result.imageStyle,
        assetId: params.promptMeta?.assetId ?? result.assetId,
      })},
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
              ${JSON.stringify(params.imageAssetMeta ?? {
                imagePrompt: result.post.imagePrompt ?? '',
                generated: result.imageSource !== 'asset',
                sourceAssetId: result.assetId ?? undefined,
              })})
    `;
  }

  const usedAssetId = (params.promptMeta?.assetId as string | undefined) ?? result.assetId;
  if (usedAssetId) {
    await markAssetUsed(env, usedAssetId);
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
  imageSource?: 'asset' | 'generated' | null;
  assetId?: string | null;
}

/**
 * 生成 Go 生態系 X 貼文(單推或 thread);tweets 超字數上限時會要求模型重寫一次。
 * 同時依模型回傳的 imagePrompt + 固定的 ECOSYSTEM_X_IMAGE_STYLE 產一張科技感 hero image
 * (16:9,配合 X 卡片顯示比例),配圖失敗不影響文字貼文,只記錄 imageError。
 */
export const SPOTLIGHT_SLUG: Record<string, string> = {
  brand_spotlight_taskgo: 'taskgo',
  brand_spotlight_homigo: 'homigo',
  brand_spotlight_washgo: 'washgo',
};

export async function generateEcosystemXPost(
  env: Env,
  params: { angle: EcosystemXAngle; collaborationContext: string; screenshotUrl?: string | null; screenshotAssetId?: string | null },
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
  if (params.screenshotUrl) {
    imageUrl = params.screenshotUrl;
  } else {
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
  }

  return {
    post, angleId: params.angle.id, angleLabel: params.angle.label, imageUrl, imageError,
    imageSource: params.screenshotUrl ? 'asset' : (imageUrl ? 'generated' : null),
    assetId: params.screenshotAssetId ?? null,
  };
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
      ${JSON.stringify({
        source: 'ecosystem_x', angleId: result.angleId, format: result.post.format,
        audienceLane: 'b2b', imageSource: result.imageSource, assetId: result.assetId,
      })}
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
              ${JSON.stringify({
                imagePrompt: result.post.imagePrompt ?? '',
                generated: result.imageSource !== 'asset',
                source: 'ecosystem_x',
                sourceAssetId: result.assetId ?? undefined,
              })})
    `;
  }

  if (result.assetId) {
    await markAssetUsed(env, result.assetId);
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

/** 從主題、簡報事實、已核准報導或定稿新聞稿寫 SEO 長文;不可整段複製原文 */
export async function generateSeoArticle(
  env: Env,
  params: {
    brandCtx: BrandContext;
    sourceTitle: string;
    sourceSummary: string;
    extraInstruction?: string;
  },
): Promise<SeoArticleResult> {
  const pitchFacts = brandSeoFacts(params.brandCtx.slug);
  const article = await chatCompleteJson<SeoArticleResult>(env, {
    messages: [
      {
        role: 'system',
        content: [
          params.brandCtx.systemPrompt,
          '',
          '你現在要寫一篇給官網/部落格的原創 SEO 長文,不是社群貼文。',
          '必須改寫,不可整段複製媒體原文或新聞稿。引用媒體時只帶出處 + 一句事實 + 原文 URL。',
          '不可發明媒體名稱、專訪、轉載數量、客戶數、營收或未經驗證的數據。',
          '簡報或後台示意數字(例如每日 1,250 單)是畫面示範,不得當成真實業績。',
          '繁體中文,800 到 1500 字,用 H2 小標分段,語氣像台灣產業顧問在跟店主講話,不是新聞稿複讀、不是廣告口號堆疊。',
          '禁用「邁向數位化的未來就是現在」「告別繁瑣」「輕鬆數位化」這類空心句。',
          `結尾 CTA 必須是:${SHARED_BRAND_CTA}`,
          pitchFacts ? `\n【可引用的產品/簡報事實(不可再發明)】\n${pitchFacts}` : '',
        ].filter(Boolean).join('\n'),
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
  article.cta = SHARED_BRAND_CTA;
  article.seoMeta = {
    title: article.seoMeta?.title || article.title,
    description: article.seoMeta?.description || article.body.slice(0, 140),
    keywords: article.seoMeta?.keywords ?? [],
    slug: article.seoMeta?.slug || 'article',
    canonicalHint: article.seoMeta?.canonicalHint || '',
  };
  return article;
}

export function pickSeoTopic(slug: string, usedTitles: string[] = []): { topic: string; angle: string } {
  const bank = SEO_TOPIC_BANK[slug] ?? SEO_TOPIC_BANK.washgo;
  const used = new Set(usedTitles.map((t) => t.replace(/\s+/g, '')));
  const unused = bank.filter((item) => !used.has(item.topic.replace(/\s+/g, '')));
  const pool = unused.length ? unused : bank;
  return pool[Math.floor(Math.random() * pool.length)];
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
