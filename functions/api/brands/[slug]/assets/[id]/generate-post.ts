import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { rowToCamel } from '../../../../../_shared/case';
import { json, error } from '../../../../../_shared/response';
import { toPublicMediaUrl } from '../../../../../_shared/media';
import { buildBrandContext } from '../../../../../_shared/prompts';
import { generateThreadsFromImage, saveGeneratedContent, findBrandAgent } from '../../../../../_shared/generate';
import { logActivity } from '../../../../../_shared/activity';

// POST /api/brands/:slug/assets/:id/generate-post
// 手動觸發:用品牌智慧素材庫裡的這張圖生成一篇 Threads 貼文,存成待審閱內容
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
  const asset = rowToCamel<{ id: string; fileUrl: string | null; caption: string | null; imageCategory: string | null }>(
    rows[0] as Record<string, unknown>,
  );
  const publicImageUrl = toPublicMediaUrl(context.env, asset.fileUrl);
  if (!publicImageUrl) return error('這個素材沒有可用的圖片網址', 400);

  try {
    const brandCtx = await buildBrandContext(context.env, brand.id);
    const agentId = await findBrandAgent(context.env, brand.id);

    const result = await generateThreadsFromImage(context.env, {
      brandCtx,
      imageUrl: publicImageUrl,
      caption: asset.caption ?? undefined,
      imageCategory: asset.imageCategory ?? undefined,
    });

    const { contentId } = await saveGeneratedContent(context.env, {
      brandCtx,
      platform: 'threads',
      result,
      generatedByAgentId: agentId,
      status: 'pending_review',
      promptMeta: { source: 'threads_hourly', category: 'image_inspired', assetId: asset.id, manual: true },
      imageAssetMeta: { sourceAssetId: asset.id, generated: false, reused: true },
    });

    await sql`
      UPDATE brand_assets SET used_in_threads_count = used_in_threads_count + 1, last_used_at = now()
      WHERE id = ${asset.id}::uuid
    `;

    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'content.generated',
      entityType: 'content',
      entityId: contentId,
      afterState: { platform: 'threads', category: 'image_inspired', assetId: asset.id, manual: true },
    });

    return json({ contentId }, 201);
  } catch (e) {
    return error(`生成失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
