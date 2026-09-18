import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';
import {
  loadWebsiteDestination, unpublishWebsiteArticle, isWebsiteSeoContent, normalizeWebsiteSeoMeta,
} from '../../../_shared/website-articles';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const contentId = context.params.id as string;
  const sql = getSql(context.env);
  const contentRows = await sql`SELECT * FROM contents WHERE id = ${contentId}::uuid LIMIT 1`;
  if (!contentRows.length) return error('找不到內容', 404);
  const content = contentRows[0] as {
    brand_id: string; content_type: string; target_platform: string | null; status: string; title: string;
  };
  if (!isWebsiteSeoContent(content)) return error('這篇不是官網長文', 400);

  const dest = await loadWebsiteDestination(context.env, content.brand_id);
  if (!dest) return error('找不到品牌目的地', 404);

  try {
    await unpublishWebsiteArticle(context.env, dest, contentId);
  } catch (e) {
    return error(e instanceof Error ? e.message : '官網下架失敗', 502);
  }

  const versionRows = await sql`
    SELECT id, seo_meta FROM content_versions
    WHERE content_id = ${contentId}::uuid ORDER BY version_number DESC LIMIT 1
  `;
  if (versionRows.length) {
    const version = versionRows[0] as { id: string; seo_meta: Record<string, unknown> | null };
    const seoMeta = normalizeWebsiteSeoMeta(version.seo_meta ?? {}, dest.slug);
    delete seoMeta.public_url;
    await sql`UPDATE content_versions SET seo_meta = ${JSON.stringify(seoMeta)} WHERE id = ${version.id}::uuid`;
  }

  await sql`
    INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, published_at, published_by, external_post_id)
    SELECT ${contentId}::uuid, id, 'website', 'cancelled', now(), ${auth.id}::uuid, 'unpublished'
    FROM content_versions WHERE content_id = ${contentId}::uuid
    ORDER BY version_number DESC LIMIT 1
  `;
  await sql`UPDATE contents SET status = 'approved', updated_at = now() WHERE id = ${contentId}::uuid`;

  await logActivity(context.env, {
    brandId: content.brand_id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'publishing.unpublished',
    entityType: 'content',
    entityId: contentId,
    afterState: { platform: 'website', title: content.title },
  });

  return json({ ok: true });
};
