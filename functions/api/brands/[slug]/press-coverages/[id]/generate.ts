import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getSql } from '../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import { buildBrandContext } from '../../../../../_shared/prompts';
import { toPressCoverage, coverageTopicSummary } from '../../../../../_shared/press';
import {
  generatePlatformPost, saveGeneratedContent, findBrandAgent,
  SUPPORTED_PLATFORMS, type SocialPlatform,
} from '../../../../../_shared/generate';

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
    SELECT * FROM press_coverages WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到這則報導', 404);
  const coverage = toPressCoverage(rows[0] as Record<string, unknown>);
  if (coverage.status !== 'published' && coverage.status !== 'syndicated') {
    return error('只有已核准的報導才能生成貼文', 400);
  }

  const brandCtx = await buildBrandContext(context.env, brand.id);
  const agentId = await findBrandAgent(context.env, brand.id);
  const topicSummary = coverageTopicSummary(coverage);
  const extra = [
    `這是「感謝／轉發見報」貼文。只能提 ${coverage.outlet},附原文連結。`,
    '不要重製媒體 Logo 或報頭。不要把轉載說成全台媒體瘋傳。',
    '可用金句卡或現場紀實口吻,像第一線人員看到自己被寫進報紙。',
    body.instruction ?? '',
  ].filter(Boolean).join('\n');

  const work = (async () => {
    const created: { contentId: string; platform: SocialPlatform }[] = [];
    const failures: { platform: SocialPlatform; error: string }[] = [];
    const results = await Promise.all(platforms.map(async (platform) => {
      try {
        const result = await generatePlatformPost(context.env, {
          brandCtx, platform,
          topic: `${coverage.outlet}報導:${coverage.headline}`,
          topicSummary,
          extraInstruction: extra,
        });
        const { contentId } = await saveGeneratedContent(context.env, {
          brandCtx, platform, result, generatedByAgentId: agentId,
          promptMeta: { source: 'press_coverage', coverageId: id, outlet: coverage.outlet },
        });
        await logActivity(context.env, {
          brandId: brand.id,
          actorType: agentId ? 'ai_agent' : 'user',
          actorAgentId: agentId,
          actorUserId: agentId ? null : auth.id,
          action: 'content.generated',
          entityType: 'content',
          entityId: contentId,
          afterState: { platform, fromPressCoverage: id },
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
