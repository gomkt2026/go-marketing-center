import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../../_shared/env';
import { requireAuth } from '../../../../../../_shared/auth';
import { getSql } from '../../../../../../_shared/db';
import { getBrandBySlug } from '../../../../../../_shared/queries';
import { json, error } from '../../../../../../_shared/response';
import { logActivity } from '../../../../../../_shared/activity';
import { buildBrandContext } from '../../../../../../_shared/prompts';
import {
  generatePlatformPost, saveGeneratedContent, findBrandAgent,
  SUPPORTED_PLATFORMS, type SocialPlatform,
} from '../../../../../../_shared/generate';

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

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM press_releases WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到這則新聞稿', 404);
  const release = rows[0] as { title: string; body: string; status: string };
  if (release.status !== 'final' && release.status !== 'approved') {
    return error('需先審核通過或定稿,才能準備社群素材', 400);
  }

  const brandCtx = await buildBrandContext(context.env, brand.id);
  const agentId = await findBrandAgent(context.env, brand.id);
  const extra = [
    '這是從自家新聞稿準備的社群素材,不是見報轉發。',
    '絕對不可寫「已被媒體報導」「登上 XX 新聞」。可以講產品事實與現場痛點。',
    '不要整段複製新聞稿,改寫成第一線口吻。',
    body.instruction ?? '',
  ].filter(Boolean).join('\n');

  const work = (async () => {
    const created: { contentId: string; platform: SocialPlatform }[] = [];
    const failures: { platform: SocialPlatform; error: string }[] = [];
    const results = await Promise.all(platforms.map(async (platform) => {
      try {
        const result = await generatePlatformPost(context.env, {
          brandCtx, platform,
          topic: release.title,
          topicSummary: release.body.slice(0, 800),
          extraInstruction: extra,
        });
        const { contentId } = await saveGeneratedContent(context.env, {
          brandCtx, platform, result, generatedByAgentId: agentId,
          promptMeta: { source: 'press_release', releaseId: id },
        });
        await logActivity(context.env, {
          brandId: brand.id,
          actorType: agentId ? 'ai_agent' : 'user',
          actorAgentId: agentId,
          actorUserId: agentId ? null : auth.id,
          action: 'content.generated',
          entityType: 'content',
          entityId: contentId,
          afterState: { platform, fromPressRelease: id },
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
