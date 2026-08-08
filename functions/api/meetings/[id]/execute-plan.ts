import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { buildBrandContext, type BrandContext } from '../../../_shared/prompts';
import { generatePlatformPost, saveGeneratedContent, findBrandAgent, type SocialPlatform } from '../../../_shared/generate';
import { logActivity } from '../../../_shared/activity';
import type { PostPlanItem } from '../../../_shared/meeting-ai';

// 執行會議結論的發文計畫:依 postPlan 逐項生成貼文草稿進入發布佇列
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const meetingId = context.params.id as string;
  const sql = getSql(context.env);
  const meetingRows = await sql`SELECT id, title, brand_id, metadata FROM meetings WHERE id = ${meetingId}::uuid LIMIT 1`;
  if (!meetingRows.length) return error('會議不存在', 404);
  const meeting = meetingRows[0] as { id: string; title: string; brand_id: string | null; metadata: Record<string, unknown> };

  const plan = ((meeting.metadata?.postPlan ?? []) as PostPlanItem[]).slice(0, 4);
  if (!plan.length) return error('這場會議沒有發文計畫,請先產生會議結論', 400);
  if (meeting.metadata?.planExecuted) return error('發文計畫已執行過', 400);

  const brandRows = await sql`SELECT id, slug FROM brands WHERE is_active = true`;
  const brandBySlug = new Map((brandRows as { id: string; slug: string }[]).map((b) => [b.slug, b.id]));

  const work = (async () => {
    // 同品牌共用 brandCtx,減少重複查詢
    const ctxCache = new Map<string, { ctx: BrandContext; agentId: string | null }>();
    async function getCtx(slug: string) {
      if (!ctxCache.has(slug)) {
        const brandId = brandBySlug.get(slug);
        if (!brandId) throw new Error(`找不到品牌 ${slug}`);
        const [ctx, agentId] = await Promise.all([
          buildBrandContext(context.env, brandId),
          findBrandAgent(context.env, brandId),
        ]);
        ctxCache.set(slug, { ctx, agentId });
      }
      return ctxCache.get(slug)!;
    }

    const created: { brandSlug: string; platform: string; contentId: string; title: string }[] = [];
    const failures: { brandSlug: string; platform: string; error: string }[] = [];

    for (const item of plan) {
      const platform = item.platform as SocialPlatform;
      if (!['facebook', 'instagram', 'threads'].includes(platform)) continue;
      try {
        const { ctx, agentId } = await getCtx(item.brandSlug);
        const result = await generatePlatformPost(context.env, {
          brandCtx: ctx,
          platform,
          topic: item.topic,
          extraInstruction: `切入角度(來自小編會議結論):${item.angle}`,
        });
        const { contentId } = await saveGeneratedContent(context.env, {
          brandCtx: ctx,
          platform,
          result,
          generatedByAgentId: agentId,
          status: 'pending_review',
          promptMeta: { source: 'meeting_plan', meetingId, topic: item.topic, angle: item.angle },
        });
        created.push({ brandSlug: item.brandSlug, platform, contentId, title: result.post.title });
      } catch (e) {
        failures.push({ brandSlug: item.brandSlug, platform, error: e instanceof Error ? e.message : '未知錯誤' });
      }
    }

    if (created.length) {
      await sql`
        UPDATE meetings SET metadata = metadata || '{"planExecuted": true}'::jsonb, updated_at = now()
        WHERE id = ${meetingId}::uuid
      `;
      await logActivity(context.env, {
        brandId: meeting.brand_id,
        actorType: 'user',
        actorUserId: auth.id,
        action: 'meeting.plan_executed',
        entityType: 'meeting',
        entityId: meetingId,
        afterState: { created: created.length, failures: failures.length },
      });
    }
    return { created, failures };
  })();

  context.waitUntil(work.then(() => undefined, () => undefined));
  const { created, failures } = await work;

  if (!created.length) {
    return error(`發文計畫全部失敗:${failures.map((f) => `${f.brandSlug}/${f.platform}: ${f.error}`).join(';')}`, 502);
  }
  return json({ created, failures }, 201);
};
