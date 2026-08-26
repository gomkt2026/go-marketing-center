import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { logActivity } from '../../../_shared/activity';
import { json, error } from '../../../_shared/response';
import { buildBrandContext, SHARED_BRAND_CTA } from '../../../_shared/prompts';
import { generatePlatformPost, generateSeoArticle, findBrandAgent, SUPPORTED_PLATFORMS, type SocialPlatform } from '../../../_shared/generate';

// 真正呼叫 LLM 重新生成內容,寫入新的 content_version
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const contentId = context.params.id as string;
  const body = await context.request.json().catch(() => ({})) as { instruction?: string };

  const sql = getSql(context.env);
  const contentRows = await sql`SELECT * FROM contents WHERE id = ${contentId}::uuid LIMIT 1`;
  if (!contentRows.length) return error('找不到內容', 404);
  const content = contentRows[0] as {
    id: string; brand_id: string; title: string | null; target_platform: string | null;
    content_type: string;
    source_market_signal_id: string | null;
    generation_prompt_meta?: { audienceLane?: 'b2b' | 'b2c'; audienceName?: string };
  };

  const isSeo = !content.target_platform && content.content_type === 'article';
  const platform = (content.target_platform ?? 'facebook') as SocialPlatform;
  if (!isSeo && !SUPPORTED_PLATFORMS.includes(platform)) {
    return error(`此內容平台(${content.target_platform})尚不支援 AI 重新生成`, 400);
  }

  const latestRows = await sql`
    SELECT version_number, body FROM content_versions
    WHERE content_id = ${contentId}::uuid ORDER BY version_number DESC LIMIT 1
  `;
  const latest = latestRows[0] as { version_number: number; body: string | null } | undefined;

  // 帶入原主題與上一版內容,讓 LLM 產生明顯改進的新版
  let topic = content.title ?? '同主題貼文';
  let topicSummary: string | undefined;
  if (content.source_market_signal_id) {
    const sigRows = await sql`SELECT title, summary FROM market_signals WHERE id = ${content.source_market_signal_id}::uuid LIMIT 1`;
    if (sigRows.length) {
      const sig = sigRows[0] as { title: string; summary: string | null };
      topic = sig.title;
      topicSummary = sig.summary ?? undefined;
    }
  }

  const brandCtx = await buildBrandContext(context.env, content.brand_id);
  const agentId = await findBrandAgent(context.env, content.brand_id);

  const extraInstruction = [
    latest?.body ? `上一版內容如下,請寫一個角度或切入點明顯不同的新版本,不要只是改寫:\n---\n${latest.body}\n---` : '',
    body.instruction ? `修改要求:${body.instruction}` : '',
  ].filter(Boolean).join('\n');

  if (isSeo) {
    const article = await generateSeoArticle(context.env, {
      brandCtx,
      sourceTitle: content.title ?? '同主題長文',
      sourceSummary: latest?.body?.slice(0, 2000) ?? '',
      extraInstruction: extraInstruction || '請換一個業者會搜的切入點重寫,不可整段沿用上一版。',
    });
    const nextVersion = (latest?.version_number ?? 0) + 1;
    const faqBlock = article.faq?.length
      ? `\n\n## FAQ\n${article.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}`
      : '';
    const versionRows = await sql`
      INSERT INTO content_versions (content_id, version_number, body, hashtags, cta, seo_meta, generated_by_agent_id)
      VALUES (
        ${contentId}::uuid, ${nextVersion}, ${`${article.body}${faqBlock}`}, ${JSON.stringify([])},
        ${article.cta || SHARED_BRAND_CTA}, ${JSON.stringify(article.seoMeta)}, ${agentId}
      )
      RETURNING id
    `;
    const versionId = (versionRows[0] as { id: string }).id;
    await sql`
      UPDATE contents SET status = 'pending_review', title = ${article.title}, updated_at = now()
      WHERE id = ${contentId}::uuid
    `;
    await sql`
      INSERT INTO content_reviews (content_id, content_version_id, reviewer_id, action, comment)
      VALUES (${contentId}::uuid, ${versionId}::uuid, ${auth.id}::uuid, 'regenerate',
              ${body.instruction ?? 'AI 重新生成 SEO 長文'})
    `;
    await logActivity(context.env, {
      brandId: content.brand_id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'content.generated',
      entityType: 'content',
      entityId: contentId,
      afterState: { versionNumber: nextVersion, type: 'seo_article' },
    });
    return json({ ok: true, versionNumber: nextVersion, title: article.title }, 201);
  }

  const result = await generatePlatformPost(context.env, {
    brandCtx, platform, topic, topicSummary, extraInstruction,
    audienceLane: content.generation_prompt_meta?.audienceLane,
    audienceName: content.generation_prompt_meta?.audienceName,
  });

  const nextVersion = (latest?.version_number ?? 0) + 1;
  const versionRows = await sql`
    INSERT INTO content_versions (content_id, version_number, body, hashtags, cta, generated_by_agent_id)
    VALUES (${contentId}::uuid, ${nextVersion}, ${result.post.body},
            ${JSON.stringify(result.post.hashtags ?? [])}, ${result.post.cta ?? ''}, ${agentId})
    RETURNING id
  `;
  const versionId = (versionRows[0] as { id: string }).id;

  if (result.imageUrl) {
    await sql`
      INSERT INTO content_assets (content_version_id, asset_type, file_url, metadata)
      VALUES (${versionId}::uuid, 'image', ${result.imageUrl},
              ${JSON.stringify({ imagePrompt: result.post.imagePrompt ?? '', generated: true })})
    `;
  }

  await sql`
    UPDATE contents SET
      status = 'pending_review',
      title = ${result.post.title},
      predicted_engagement_score = ${Math.max(0, Math.min(100, result.prediction.score))},
      engagement_analysis = ${result.prediction.analysis + (result.prediction.suggestions.length ? `\n改進建議:\n- ${result.prediction.suggestions.join('\n- ')}` : '')},
      updated_at = now()
    WHERE id = ${contentId}::uuid
  `;

  await sql`
    INSERT INTO content_reviews (content_id, content_version_id, reviewer_id, action, comment)
    VALUES (${contentId}::uuid, ${versionId}::uuid, ${auth.id}::uuid, 'regenerate',
            ${body.instruction ?? 'AI 重新生成新版本'})
  `;

  await logActivity(context.env, {
    brandId: content.brand_id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'content.generated',
    entityType: 'content',
    entityId: contentId,
    afterState: { versionNumber: nextVersion, platform },
  });

  return json({
    ok: true,
    versionNumber: nextVersion,
    predictedEngagementScore: result.prediction.score,
    imageUrl: result.imageUrl,
    imageError: result.imageError,
  }, 201);
};
