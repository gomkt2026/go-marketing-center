import type { Env } from './env';
import { getSql } from './db';
import { chatCompleteJson, generateImage, generateImageWithReference } from './openai';
import {
  buildBrandContext, buildPostUserPrompt, buildEngagementEvalPrompt, getBrandVoice,
  HOMIGO_TEXT_MARK_RULE, BRAND_DESIGN_IMAGE_STYLE, SYSTEM_SCREENSHOT_POSTER_RULE,
  OFFTOPIC_SYSTEM_PROMPT, composeOfftopicPrompt,
  buildImageInspiredPostPrompt,
  ECOSYSTEM_X_SYSTEM_PROMPT, buildEcosystemXUserPrompt, ECOSYSTEM_X_IMAGE_STYLE,
  defaultAudienceLane, pickAudience, pickImageStyle, audienceLaneInstruction, SHARED_BRAND_CTA,
  SEO_TOPIC_BANK, brandSeoFacts, type SeoTopicSeed,
  buildSocialImagePrompt, PHOTO_EDITORIAL_CONVERT_RULE, TASKGO_GRAPHIC_CONVERT_RULE,
  WASHGO_CUTE_CONVERT_RULE,
  type BrandContext, type GeneratedPost, type EngagementPrediction,
  type GeneratedXPost, type EcosystemXAngle,
  type AudienceLane, type ImageStyleId,
} from './prompts';
import { buildMediaKey, getMediaBytes, mediaUrlToKey, putMedia, toPublicMediaUrl } from './media';
import { compositeLogo } from './watermark';
import { frameScreenshotForIg } from './ig-frame';
import { normalizeMultilineText } from './text';
import { X_TWEET_MAX_CHARS } from './x';
import { burnPosterHeadline, POSTER_NO_GLYPHS_RULE } from './poster-text';
import {
  websiteCta, websiteCtaRule, websiteAuthor, normalizeWebsiteSeoMeta,
  applyWebsiteArticleMigration, isMissingWebsiteArticleSchema,
  type WebsiteSeoMeta,
} from './website-articles';

export type SocialPlatform = 'facebook' | 'instagram' | 'threads';

export const SUPPORTED_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'threads'];

/** 三平台依序跑,避免一次 Worker 把 Neon / OpenAI subrequest 打爆 */
export async function runPlatformJobs<T>(
  platforms: SocialPlatform[],
  work: (platform: SocialPlatform) => Promise<T>,
): Promise<{ created: T[]; failures: { platform: SocialPlatform; error: string }[] }> {
  const created: T[] = [];
  const failures: { platform: SocialPlatform; error: string }[] = [];
  for (const platform of platforms) {
    try {
      created.push(await work(platform));
    } catch (e) {
      failures.push({ platform, error: e instanceof Error ? e.message : '生成失敗' });
    }
  }
  return { created, failures };
}

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
  offtopicCategory?: string;
  loveAngle?: string;
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

async function finishPosterImage(
  env: Env,
  bytes: Uint8Array,
  params: {
    brandSlug: string;
    landscape: boolean;
    headline?: string;
    accent?: string;
    advantage?: string;
    kicker?: string;
    body: string;
    logo: Uint8Array | null;
    logoPosition: 'bottom-left' | 'bottom-right';
  },
): Promise<Uint8Array> {
  try {
    bytes = await burnPosterHeadline(env, bytes, {
      brandSlug: params.brandSlug,
      headline: params.headline,
      accent: params.accent,
      advantage: params.advantage,
      kicker: params.kicker,
      body: params.body,
      landscape: params.landscape,
    });
  } catch (e) {
    console.error('[generate] 海報主標後製失敗,沿用無字原圖', e);
  }
  if (params.logo) {
    try {
      bytes = await compositeLogo(bytes, params.logo, { position: params.logoPosition });
    } catch (e) {
      console.error('[generate] logo 合成失敗,改用無 logo 原圖', e);
    }
  }
  return bytes;
}

/** 把真實系統截圖做成 B 端痛點海報;失敗回 null 讓呼叫端退回簡報框原圖 */
async function generateSystemScreenshotPoster(
  env: Env,
  params: {
    brandSlug: string;
    platform: SocialPlatform;
    imagePrompt?: string | null;
    posterHeadline?: string;
    posterAccent?: string;
    posterAdvantage?: string;
    posterKicker?: string;
    body?: string;
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
      || 'B2B pain-point poster. Leave an empty banner for typography. No letters or glyphs.';
    const prompt = [
      headlineHint,
      designSpec,
      SYSTEM_SCREENSHOT_POSTER_RULE,
      POSTER_NO_GLYPHS_RULE,
      isFb
        ? 'LANDSCAPE poster 3:2. Empty left 38% banner. Scene and device card on the right.'
        : 'PORTRAIT poster. Empty top 25% banner.',
      logo
        ? 'Do not draw any logo or brand wordmark; leave a clean corner for the official logo composite.'
        : params.brandSlug === 'homigo' ? HOMIGO_TEXT_MARK_RULE : '',
    ].filter(Boolean).join('\n\n');
    const size = isFb ? '1536x1024' as const : isIg ? '1024x1536' as const : '1024x1024' as const;
    let bytes = await generateImageWithReference(env, {
      prompt, reference: ref, size, quality: 'high', inputFidelity: 'high',
    });
    bytes = await finishPosterImage(env, bytes, {
      brandSlug: params.brandSlug,
      landscape: isFb,
      headline: params.posterHeadline,
      accent: params.posterAccent,
      advantage: params.posterAdvantage,
      kicker: params.posterKicker,
      body: params.body ?? '',
      logo,
      logoPosition: isIg && params.brandSlug === 'homigo' ? 'bottom-left' : 'bottom-right',
    });
    const key = buildMediaKey(params.brandSlug, 'jpg');
    return await putMedia(env, key, bytes, 'image/jpeg');
  } catch (e) {
    console.error('[generate] 系統畫面海報生成失敗,改用簡報框原圖', e);
    return null;
  }
}

/** 把實拍轉成品牌編輯海報(Homigo 紙本;Washgo 可愛插畫;TaskGo 平面);失敗回 null 沿用原圖 */
async function generatePhotoEditorialPoster(
  env: Env,
  params: {
    brandSlug: string;
    platform: SocialPlatform;
    imagePrompt?: string | null;
    posterHeadline?: string;
    posterAccent?: string;
    posterAdvantage?: string;
    posterKicker?: string;
    body?: string;
    photoUrl: string;
  },
): Promise<string | null> {
  try {
    const ref = await loadAssetBytes(env, params.photoUrl);
    if (!ref) return null;
    const isFb = params.platform === 'facebook';
    const isIg = params.platform === 'instagram';
    const logo = await getBrandLogo(env, params.brandSlug);
    const convertRule = params.brandSlug === 'taskgo'
      ? TASKGO_GRAPHIC_CONVERT_RULE
      : params.brandSlug === 'washgo'
        ? WASHGO_CUTE_CONVERT_RULE
        : PHOTO_EDITORIAL_CONVERT_RULE;
    const prompt = buildSocialImagePrompt({
      brandSlug: params.brandSlug,
      scene: [params.imagePrompt?.trim() || 'Redraw this photograph as a brand editorial poster.', convertRule].join('\n\n'),
      imageStyle: 'photo',
      landscape: isFb,
      hasLogo: !!logo,
      emptyBanner: true,
    });
    const size = isFb ? '1536x1024' as const : isIg ? '1024x1536' as const : '1024x1024' as const;
    let bytes = await generateImageWithReference(env, {
      prompt, reference: ref, size, quality: 'high', inputFidelity: 'high',
    });
    bytes = await finishPosterImage(env, bytes, {
      brandSlug: params.brandSlug,
      landscape: isFb,
      headline: params.posterHeadline,
      accent: params.posterAccent,
      advantage: params.posterAdvantage,
      kicker: params.posterKicker,
      body: params.body ?? '',
      logo,
      logoPosition: isIg && params.brandSlug === 'homigo' ? 'bottom-left' : 'bottom-right',
    });
    const key = buildMediaKey(params.brandSlug, 'jpg');
    return await putMedia(env, key, bytes, 'image/jpeg');
  } catch (e) {
    console.error('[generate] 實拍編輯海報轉換失敗,沿用原圖', e);
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
    const framed = await frameScreenshotForIg(bytes, brandSlug);
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
    /** 小編語音工作台先回文案,配圖之後再補 */
    skipImage?: boolean;
    /** 工作台產稿省掉互動評估的額外 LLM,降低 Worker subrequest */
    skipPrediction?: boolean;
  },
): Promise<GenerationResult> {
  const { brandCtx, platform } = params;
  const lane = params.audienceLane ?? defaultAudienceLane(platform);
  const audience = params.audienceName
    ? { name: params.audienceName, lane, painPoints: [], appealAngle: null }
    : params.skipImage
      ? { name: lane === 'b2b' ? '業者' : '使用者', lane, painPoints: [], appealAngle: null }
      : await pickAudience(env, brandCtx.brandId, brandCtx.slug, lane);

  let reusedAsset: BrandAssetPick | null = null;
  // B 端 FB/IG 優先取真實系統畫面當素材,但要做成痛點海報,不是整頁截圖直發。
  // Threads 本來就不走素材庫。
  if (!params.skipImage && !params.skipAssetLookup && (platform === 'facebook' || platform === 'instagram')) {
    try {
      reusedAsset = await pickBrandAsset(env, brandCtx.brandId, lane === 'b2b');
    } catch (e) {
      console.error('[generate] 素材庫查詢失敗,改走生圖', e);
    }
  }

  const screenshotPoster = !!(reusedAsset && isSystemScreenshot(reusedAsset)
    && (platform === 'facebook' || platform === 'instagram'));
  const convertPhotoPoster = !!(reusedAsset && !screenshotPoster
    && (platform === 'facebook' || platform === 'instagram'));
  const recentStyles = params.skipImage || convertPhotoPoster || screenshotPoster
    ? []
    : await recentImageStyles(env, brandCtx.brandId).catch(() => [] as ImageStyleId[]);
  const imageStyle = screenshotPoster || convertPhotoPoster
    ? 'design' as const
    : pickImageStyle({ platform, lane, brandSlug: brandCtx.slug, recentStyles });

  const userPrompt = buildPostUserPrompt({
    platform, topic: params.topic, topicSummary: params.topicSummary,
    extraInstruction: [
      params.extraInstruction ?? '',
      screenshotPoster
        ? `本篇會用品牌上傳的系統畫面「${reusedAsset?.caption ?? '後台截圖'}」做成痛點海報。文案要對得上這張真實畫面。`
        : convertPhotoPoster
          ? `本篇會把品牌上傳的「${reusedAsset?.imageCategory ?? '實拍'}」${reusedAsset?.caption ? `:${reusedAsset.caption}` : ''}轉成${brandCtx.slug === 'washgo' ? 'Washgo 可愛洗衣插畫海報' : '品牌編輯海報'}。文案要對得上原照片裡真的有的細節。`
          : '',
    ].filter(Boolean).join('\n'),
    brandSlug: brandCtx.slug,
    audienceLane: lane,
    audienceName: audience.name,
    imageStyle: imageStyle ?? undefined,
    skipImagePrompt: false,
    screenshotPoster,
    convertPhotoPoster,
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
        { role: 'user', content: `這篇 ${post.body.length} 字,超過 ${hardLimit} 字上限。請只保留一個核心重點,縮短到 ${hardLimit} 字以內,回傳同格式 JSON(imagePrompt、posterHeadline、posterAdvantage 保留不變)。` },
      ],
      temperature: 0.5,
    });
    post.body = normalizeMultilineText(post.body);
    post.hashtags = clampHashtags(post.hashtags, platform);
  }
  post.cta = SHARED_BRAND_CTA;
  post.hashtags = clampHashtags(post.hashtags, platform);

  const prediction = params.skipPrediction
    ? { score: 0, analysis: '', suggestions: [] }
    : await chatCompleteJson<EngagementPrediction>(env, {
      messages: [
        { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
        { role: 'user', content: buildEngagementEvalPrompt({ platform, body: post.body }) },
      ],
      temperature: 0.3,
    });

  if (params.skipImage) {
    return {
      post, prediction, imageUrl: null, imageError: null,
      audienceLane: lane, audienceName: audience.name,
      imageSource: null, imageStyle, assetId: reusedAsset?.id ?? null,
    };
  }

  if (screenshotPoster && reusedAsset) {
    const posterUrl = await generateSystemScreenshotPoster(env, {
      brandSlug: brandCtx.slug,
      platform,
      imagePrompt: post.imagePrompt,
      posterHeadline: post.posterHeadline,
      posterAccent: post.posterAccent,
      posterAdvantage: post.posterAdvantage,
      posterKicker: post.posterKicker,
      body: post.body,
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

  if (convertPhotoPoster && reusedAsset) {
    const posterUrl = await generatePhotoEditorialPoster(env, {
      brandSlug: brandCtx.slug,
      platform,
      imagePrompt: post.imagePrompt,
      posterHeadline: post.posterHeadline,
      posterAccent: post.posterAccent,
      posterAdvantage: post.posterAdvantage,
      posterKicker: post.posterKicker,
      body: post.body,
      photoUrl: reusedAsset.fileUrl,
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
      post, prediction, imageUrl: fallbackUrl, imageError: '實拍編輯海報轉換失敗,沿用原圖',
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
      const isIg = platform === 'instagram';
      const style = imageStyle ?? 'photo';
      const logo = await getBrandLogo(env, brandCtx.slug);
      const prompt = buildSocialImagePrompt({
        brandSlug: brandCtx.slug,
        scene: post.imagePrompt,
        imageStyle: style === 'illustration' ? 'photo' : style,
        landscape: isFb,
        hasLogo: !!logo,
        emptyBanner: isFb || isIg,
      });
      const size = isFb ? '1536x1024' as const : isIg ? '1024x1536' as const : '1024x1024' as const;
      const quality = style === 'design' || isFb || isIg || brandCtx.slug === 'washgo' ? 'high' as const : 'medium' as const;
      let bytes = await generateImage(env, { prompt, size, quality });
      const shouldOverlay = isFb || isIg || !!post.posterHeadline;
      if (shouldOverlay) {
        bytes = await finishPosterImage(env, bytes, {
          brandSlug: brandCtx.slug,
          landscape: isFb,
          headline: post.posterHeadline,
          accent: post.posterAccent,
          advantage: post.posterAdvantage,
          kicker: post.posterKicker,
          body: post.body,
          logo,
          logoPosition: isIg && brandCtx.slug === 'homigo' ? 'bottom-left' : 'bottom-right',
        });
      } else if (logo) {
        try {
          bytes = await compositeLogo(bytes, logo, { position: 'bottom-right' });
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
 * Threads 生活哏文/生活散文。
 * 刻意不套用 brandCtx.systemPrompt(不帶產品知識庫),只借 brandSlug 決定要不要用品牌世界當愛情場景。
 * 不強制配圖:這類貼文用純文字表現最自然,才不會混進品牌視覺風格。
 */
export async function generateOfftopicPost(
  env: Env,
  params: { usedTopics: string[]; brandSlug?: string; forceLoveStory?: boolean; usedAngles?: string[] },
): Promise<GenerationResult> {
  const spec = composeOfftopicPrompt(params.usedTopics, params.brandSlug, {
    forceLoveStory: params.forceLoveStory,
    usedAngles: params.usedAngles,
  });
  const userPrompt = spec.prompt;
  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [
      { role: 'system', content: OFFTOPIC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.9,
  });
  post.body = normalizeMultilineText(post.body);
  post.replyBody = post.replyBody ? normalizeMultilineText(post.replyBody).slice(0, 120) : '';
  post.hashtags = [];
  post.imagePrompt = undefined;
  if (spec.isLoveStory && !post.replyBody && spec.replyHint) post.replyBody = spec.replyHint;

  if (post.body.length > 500) {
    post = await chatCompleteJson<GeneratedPost>(env, {
      messages: [
        { role: 'system', content: OFFTOPIC_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
        { role: 'assistant', content: JSON.stringify(post) },
        { role: 'user', content: `這篇 body ${post.body.length} 字,超過 Threads 500 字上限。只保留一個核心重點,縮短到 500 字以內,回傳同格式 JSON。` },
      ],
      temperature: 0.7,
    });
    post.body = normalizeMultilineText(post.body);
    post.replyBody = post.replyBody ? normalizeMultilineText(post.replyBody).slice(0, 120) : '';
    post.hashtags = [];
    post.imagePrompt = undefined;
    if (spec.isLoveStory && !post.replyBody && spec.replyHint) post.replyBody = spec.replyHint;
  }

  const prediction = await chatCompleteJson<EngagementPrediction>(env, {
    messages: [
      { role: 'system', content: '你是台灣社群數據分析師,擅長預估貼文互動表現。' },
      { role: 'user', content: buildEngagementEvalPrompt({ platform: 'threads', body: post.body }) },
    ],
    temperature: 0.3,
  });

  return { post, prediction, imageUrl: null, imageError: null, offtopicCategory: spec.category, loveAngle: spec.loveAngle };
}

/**
 * 看圖寫貼文:用品牌智慧素材庫上傳的一張圖當話題。
 * 系統截圖與實拍在 FB/IG 會轉成品牌編輯海報(Homigo 紙本、Washgo 可愛插畫、TaskGo 平面);失敗才沿用原圖。
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
  const convertPhotoPoster = !screenshotPoster && (platform === 'facebook' || platform === 'instagram')
    && ['real_photo', 'people', 'scene', 'brand_collab'].includes(params.imageCategory ?? '');
  let post = await chatCompleteJson<GeneratedPost>(env, {
    messages: [{ role: 'system', content: systemPrompt }, visionUserMessage],
  });
  post.body = normalizeMultilineText(post.body);
  if (!screenshotPoster && !convertPhotoPoster) post.imagePrompt = undefined;
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
    if (!screenshotPoster && !convertPhotoPoster) post.imagePrompt = undefined;
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
      posterHeadline: post.posterHeadline,
      posterAccent: post.posterAccent,
      posterAdvantage: post.posterAdvantage,
      posterKicker: post.posterKicker,
      body: post.body,
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

  if (convertPhotoPoster) {
    const posterUrl = await generatePhotoEditorialPoster(env, {
      brandSlug: brandCtx.slug,
      platform,
      imagePrompt: post.imagePrompt,
      posterHeadline: post.posterHeadline,
      posterAccent: post.posterAccent,
      posterAdvantage: post.posterAdvantage,
      posterKicker: post.posterKicker,
      body: post.body,
      photoUrl: imageUrl,
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
        replyBody: params.promptMeta?.replyBody ?? result.post.replyBody ?? undefined,
        posterHeadline: result.post.posterHeadline ?? undefined,
        posterAccent: result.post.posterAccent ?? undefined,
        posterAdvantage: result.post.posterAdvantage ?? undefined,
        posterKicker: result.post.posterKicker ?? undefined,
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
  description: string;
  body: string;
  outline: string[];
  faq: { q?: string; a?: string; question?: string; answer?: string }[];
  cta: string;
  answer_box?: string;
  related_terms?: string[];
  primary_keyword?: string;
  search_intent?: 'informational' | 'solution';
  category?: WebsiteSeoMeta['category'];
  audience?: WebsiteSeoMeta['audience'];
  seoMeta: WebsiteSeoMeta;
}

interface SeoArticleLlmShape extends Omit<SeoArticleResult, 'seoMeta'> {
  seoMeta?: Partial<WebsiteSeoMeta> & { keywords?: string[]; title?: string; description?: string; slug?: string };
}

/** 從主題、簡報事實、已核准報導或定稿新聞稿寫官網 SEO 長文;GEO 順序固定 */
export async function generateSeoArticle(
  env: Env,
  params: {
    brandCtx: BrandContext;
    sourceTitle: string;
    sourceSummary: string;
    extraInstruction?: string;
    topicSeed?: SeoTopicSeed;
    marketSignalId?: string | null;
  },
): Promise<SeoArticleResult> {
  const slug = params.brandCtx.slug;
  const seed = params.topicSeed;
  const audience = seed?.audience ?? (slug === 'washgo' ? 'consumer' : undefined);
  const cta = websiteCta(slug, audience);
  const pitchFacts = brandSeoFacts(slug);
  const relatedHint = (seed?.relatedTerms ?? []).join('、');
  const article = await chatCompleteJson<SeoArticleLlmShape>(env, {
    messages: [
      {
        role: 'system',
        content: [
          params.brandCtx.systemPrompt,
          '',
          '你現在要寫一篇給官網/部落格的原創 SEO 長文,不是社群貼文,也不是 Threads / IG 短文拉長。',
          '必須改寫,不可整段複製媒體原文或新聞稿。引用媒體時只帶出處 + 一句事實 + 原文 URL。',
          '不可發明媒體名稱、專訪、轉載數量、客戶數、營收或未經驗證的數據。',
          '簡報或後台示意數字(例如每日 1,250 單)是畫面示範,不得當成真實業績。',
          '繁體中文(台灣用語),正文 800 到 1800 字(不含答案區與 FAQ),至少 3 個 H2。',
          '語氣專業但不生硬。開頭不要故事、不要先打廣告。',
          '固定順序:1) answer_box 先直接回答主關鍵字(一句定義+三點結論,80-150字,整段可被 AI 摘走) 2) 接下來 2-3 段把 related_terms 寫進真實場景 3) H2/H3 展開 4) FAQ 3-5 題 5) 最後才品牌 CTA。',
          '主關鍵字寫進 seo_title、seo_description、answer_box、一個 H2。相關詞自然出現,不要堆標題。',
          'FAQ 問句接近搜尋原話,答案 2-4 句、可獨立被摘。禁止「歡迎詢問」「視情況而定」。',
          'slug 只用小寫英文、數字、連字號,反映主關鍵字語意,不用中文、不用日期。',
          websiteCtaRule(slug, audience),
          `結尾 CTA 必須寫成:${cta}`,
          slug === 'washgo' ? 'Washgo 是衣物洗滌/乾洗,不是洗車。品牌名寫 Washgo。不可寫 5,000+ 客戶、98% 滿意度、保證不縮水。' : '',
          pitchFacts ? `\n【可引用的產品/簡報事實(不可再發明)】\n${pitchFacts}` : '',
        ].filter(Boolean).join('\n'),
      },
      {
        role: 'user',
        content: [
          `題目來源:${params.sourceTitle}`,
          params.sourceSummary,
          seed?.primaryKeyword ? `主關鍵字:${seed.primaryKeyword}` : '',
          relatedHint ? `相關詞(必須自然寫進內文,6-12個):${relatedHint}` : '請自訂 6-12 個相關詞(長尾、同義、場景詞)。',
          seed?.category ? `分類:${seed.category}` : '',
          seed?.searchIntent ? `搜尋意圖:${seed.searchIntent}` : '',
          audience ? `受眾:${audience}` : '',
          params.extraInstruction ?? '',
          '',
          '回傳 JSON:{"title":"12-60字 H1","description":"40-160字列表摘要不含空白至少40字","body":"800-1800字 markdown 正文,至少3個H2,不含答案區與FAQ","outline":["H2"],"answer_box":"80-150字","primary_keyword":"恰好1個","related_terms":["相關詞"],"search_intent":"informational或solution","category":"pain|product|policy|trust|talk","audience":"consumer或merchant","faq":[{"question":"","answer":""}],"cta":"文末行動","seoMeta":{"slug":"english-slug","seo_title":"含主關鍵字","seo_description":"70-160字 meta 摘要,不可少於70字"}}',
        ].filter(Boolean).join('\n'),
      },
    ],
    temperature: 0.6,
    maxTokens: 6000,
  });
  article.body = normalizeMultilineText(article.body);
  article.cta = cta;
  const related = article.related_terms?.length ? article.related_terms : seed?.relatedTerms ?? [];
  const seoMeta = normalizeWebsiteSeoMeta({
    ...(article.seoMeta ?? {}),
    slug: article.seoMeta?.slug,
    title: article.seoMeta?.seo_title || article.seoMeta?.title || article.title,
    description: article.description || article.seoMeta?.description || '',
    seo_title: article.seoMeta?.seo_title || article.seoMeta?.title || article.title,
    seo_description: article.seoMeta?.seo_description || '',
    primary_keyword: article.primary_keyword || seed?.primaryKeyword,
    related_terms: related,
    search_intent: article.search_intent || seed?.searchIntent,
    category: article.category || seed?.category,
    audience,
    answer_box: article.answer_box,
    faq: article.faq as unknown as WebsiteSeoMeta['faq'],
    author: websiteAuthor(slug),
    market_signal_id: params.marketSignalId ?? null,
    keywords: related,
  }, slug);
  return {
    title: article.title,
    description: seoMeta.description || article.description || '',
    body: article.body,
    outline: article.outline ?? [],
    faq: article.faq ?? [],
    cta,
    answer_box: seoMeta.answer_box,
    related_terms: seoMeta.related_terms,
    primary_keyword: seoMeta.primary_keyword,
    search_intent: seoMeta.search_intent,
    category: seoMeta.category,
    audience: seoMeta.audience,
    seoMeta,
  };
}

export function pickSeoTopic(slug: string, usedTitles: string[] = []): SeoTopicSeed {
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
  const body = params.article.body;
  const insert = () => sql`
    INSERT INTO contents (
      campaign_id, brand_id, content_type, target_platform, title, status,
      generated_by_agent_id, generation_prompt_meta
    ) VALUES (
      NULL, ${params.brandCtx.brandId}::uuid, 'article', 'website',
      ${params.article.title}, 'pending_review',
      ${params.generatedByAgentId ?? null},
      ${JSON.stringify(params.promptMeta ?? { source: 'seo_article' })}
    ) RETURNING id
  `;
  let contentRows;
  try {
    contentRows = await insert();
  } catch (e) {
    if (!isMissingWebsiteArticleSchema(e)) throw e;
    await applyWebsiteArticleMigration(env);
    contentRows = await insert();
  }
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
