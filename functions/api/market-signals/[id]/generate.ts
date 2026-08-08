import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { logActivity } from '../../../_shared/activity';
import { json, error } from '../../../_shared/response';
import { buildBrandContext } from '../../../_shared/prompts';
import {
  generatePlatformPost, saveGeneratedContent, findBrandAgent,
  SUPPORTED_PLATFORMS, type SocialPlatform,
} from '../../../_shared/generate';

// 從一則市場情報生成貼文(可選平台,預設 FB/IG/Threads 三平台差異化生成)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const signalId = context.params.id as string;
  const body = await context.request.json().catch(() => ({})) as { platforms?: string[]; instruction?: string };
  const platforms = (body.platforms?.length
    ? body.platforms.filter((p): p is SocialPlatform => (SUPPORTED_PLATFORMS as string[]).includes(p))
    : SUPPORTED_PLATFORMS);
  if (!platforms.length) return error('platforms 無效,支援 facebook / instagram / threads', 400);

  const sql = getSql(context.env);
  const signalRows = await sql`SELECT * FROM market_signals WHERE id = ${signalId}::uuid LIMIT 1`;
  if (!signalRows.length) return error('找不到市場情報', 404);
  const signal = signalRows[0] as { id: string; brand_id: string; title: string; summary: string | null };

  const brandCtx = await buildBrandContext(context.env, signal.brand_id);
  const agentId = await findBrandAgent(context.env, signal.brand_id);

  const created: { contentId: string; platform: SocialPlatform; score: number; imageUrl: string | null; imageError: string | null }[] = [];
  const failures: { platform: SocialPlatform; error: string }[] = [];

  for (const platform of platforms) {
    try {
      const result = await generatePlatformPost(context.env, {
        brandCtx,
        platform,
        topic: signal.title,
        topicSummary: signal.summary ?? undefined,
        extraInstruction: body.instruction,
      });
      const contentId = await saveGeneratedContent(context.env, {
        brandCtx,
        platform,
        result,
        sourceMarketSignalId: signalId,
        generatedByAgentId: agentId,
        promptMeta: { source: 'market_signal', signalId, instruction: body.instruction ?? null },
      });
      created.push({ contentId, platform, score: result.prediction.score, imageUrl: result.imageUrl, imageError: result.imageError });

      await logActivity(context.env, {
        brandId: signal.brand_id,
        actorType: agentId ? 'ai_agent' : 'user',
        actorAgentId: agentId,
        actorUserId: agentId ? null : auth.id,
        action: 'content.generated',
        entityType: 'content',
        entityId: contentId,
        afterState: { platform, fromSignal: signalId },
      });
    } catch (e) {
      failures.push({ platform, error: e instanceof Error ? e.message : '生成失敗' });
    }
  }

  if (created.length) {
    await sql`UPDATE market_signals SET status = 'used' WHERE id = ${signalId}::uuid AND status IN ('new', 'discussed')`;
  }
  if (!created.length) {
    return error(`全部平台生成失敗:${failures.map((f) => `${f.platform}: ${f.error}`).join(';')}`, 502);
  }

  return json({ created, failures }, 201);
};
