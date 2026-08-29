import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import { toPublicMediaUrl } from '../../../../../_shared/media';
import { buildBrandContext, defaultAudienceLane } from '../../../../../_shared/prompts';
import {
  generatePlatformPost, generatePostFromImage, saveGeneratedContent, findBrandAgent,
  SUPPORTED_PLATFORMS, type SocialPlatform,
} from '../../../../../_shared/generate';
import {
  collateralKindLabel, documentTopicSummary, isCollateralDocument, toBrandDocument,
} from '../../../../../_shared/documents';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as { platforms?: string[]; instruction?: string };
  const platforms = (body.platforms?.length
    ? body.platforms.filter((p): p is SocialPlatform => (SUPPORTED_PLATFORMS as string[]).includes(p))
    : SUPPORTED_PLATFORMS);
  if (!platforms.length) return error('platforms 無效', 400);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_documents WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到這份文件', 404);
  const doc = toBrandDocument(rows[0] as Record<string, unknown>);
  if (!isCollateralDocument(doc)) return error('只有 DM／簡報能生成社群貼文', 400);
  if (doc.extractStatus !== 'ready') return error('這份檔案還沒抽出可用賣點', 400);

  const brandCtx = await buildBrandContext(context.env, brand.id);
  const agentId = await findBrandAgent(context.env, brand.id);
  const topicSummary = documentTopicSummary(doc);
  const kind = collateralKindLabel(doc.sourceType);
  const extra = [
    `這篇要根據品牌官方${kind}《${doc.title}》來寫,只能用已抽出的賣點與摘要,不可發明優惠、價格或截止日。`,
    '語氣像第一線人員轉述手上的宣傳物,不要寫成「請見附件 DM」。',
    body.instruction ?? '',
  ].filter(Boolean).join('\n');
  const imageUrl = doc.mimeType?.startsWith('image/') ? toPublicMediaUrl(context.env, doc.fileUrl) : null;

  const work = (async () => {
    const created: { contentId: string; platform: SocialPlatform }[] = [];
    const failures: { platform: SocialPlatform; error: string }[] = [];
    const results = await Promise.all(platforms.map(async (platform) => {
      try {
        const result = imageUrl
          ? await generatePostFromImage(context.env, {
            brandCtx, platform, imageUrl,
            caption: topicSummary,
            imageCategory: 'other',
            audienceLane: defaultAudienceLane(platform),
            extraInstruction: extra,
          })
          : await generatePlatformPost(context.env, {
            brandCtx, platform,
            topic: `${kind}:${doc.title}`,
            topicSummary,
            extraInstruction: extra,
          });
        const { contentId } = await saveGeneratedContent(context.env, {
          brandCtx, platform, result, generatedByAgentId: agentId,
          promptMeta: { source: 'brand_document', documentId: id, sourceType: doc.sourceType },
          imageAssetMeta: imageUrl ? { sourceDocumentId: id, generated: false, reused: true } : undefined,
        });
        await logActivity(context.env, {
          brandId: brand.id,
          actorType: agentId ? 'ai_agent' : 'user',
          actorAgentId: agentId,
          actorUserId: agentId ? null : auth.id,
          action: 'content.generated',
          entityType: 'content',
          entityId: contentId,
          afterState: { platform, fromDocument: id, sourceType: doc.sourceType },
        });
        return { ok: true as const, item: { contentId, platform } };
      } catch (e) {
        return { ok: false as const, platform, error: e instanceof Error ? e.message : '生成失敗' };
      }
    }));
    for (const r of results) {
      if (r.ok) created.push(r.item);
      else failures.push({ platform: r.platform, error: r.error });
    }
    return { created, failures };
  })();

  context.waitUntil(work.then(() => undefined, () => undefined));
  const { created, failures } = await work;
  if (!created.length) {
    return error(`全部平台生成失敗:${failures.map((f) => `${f.platform}: ${f.error}`).join(';')}`, 502);
  }
  return json({ created, failures }, 201);
};
