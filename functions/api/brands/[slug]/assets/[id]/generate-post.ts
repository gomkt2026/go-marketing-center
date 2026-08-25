import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { rowToCamel } from '../../../../../_shared/case';
import { json, error } from '../../../../../_shared/response';
import { toPublicMediaUrl } from '../../../../../_shared/media';
import { buildBrandContext, defaultAudienceLane } from '../../../../../_shared/prompts';
import {
  generatePostFromImage, saveGeneratedContent, findBrandAgent, SUPPORTED_PLATFORMS, type SocialPlatform,
} from '../../../../../_shared/generate';
import { logActivity } from '../../../../../_shared/activity';

// POST /api/brands/:slug/assets/:id/generate-post
// 手動觸發:用素材庫這張圖生成 FB / IG / Threads 貼文,存成待審閱內容
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const assetId = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as { platform?: string };
  const platform = (body.platform ?? 'threads') as SocialPlatform;
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return error('platform 只支援 facebook / instagram / threads', 400);
  }

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_assets
    WHERE id = ${assetId}::uuid AND brand_id = ${brand.id}::uuid AND asset_type = 'image'
    LIMIT 1
  `;
  if (!rows.length) return error('Asset not found', 404);
  const asset = rowToCamel<{ id: string; fileUrl: string | null; caption: string | null; imageCategory: string | null }>(
    rows[0] as Record<string, unknown>,
  );
  const publicImageUrl = toPublicMediaUrl(context.env, asset.fileUrl);
  if (!publicImageUrl) return error('這個素材沒有可用的圖片網址', 400);

  try {
    const brandCtx = await buildBrandContext(context.env, brand.id);
    const agentId = await findBrandAgent(context.env, brand.id);
    const audienceLane = defaultAudienceLane(platform);

    const result = await generatePostFromImage(context.env, {
      brandCtx,
      platform,
      imageUrl: publicImageUrl,
      caption: asset.caption ?? undefined,
      imageCategory: asset.imageCategory ?? undefined,
      audienceLane,
      assetId: asset.id,
    });

    const { contentId } = await saveGeneratedContent(context.env, {
      brandCtx,
      platform,
      result,
      generatedByAgentId: agentId,
      status: 'pending_review',
      promptMeta: {
        source: platform === 'threads' ? 'threads_hourly' : 'daily_theme',
        category: 'image_inspired',
        assetId: asset.id,
        manual: true,
        audienceLane,
        audienceName: result.audienceName,
      },
      imageAssetMeta: { sourceAssetId: asset.id, generated: false, reused: true },
    });

    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'content.generated',
      entityType: 'content',
      entityId: contentId,
      afterState: { platform, category: 'image_inspired', assetId: asset.id, manual: true, audienceLane },
    });

    return json({ contentId, platform }, 201);
  } catch (e) {
    return error(`生成失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
