import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { getSql } from '../../../../../_shared/db';
import { logActivity } from '../../../../../_shared/activity';
import {
  getCsDocument, isValidHelpRole, parsePagePaths, replaceDocumentRoles, withProductHelp,
  type PublishStatus,
} from '../../../../../_shared/product-help';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const document = await getCsDocument(context.env, brand.id, id);
  if (!document) return error('文件不存在', 404);
  return json({ document });
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const current = await getCsDocument(context.env, brand.id, id);
  if (!current) return error('文件不存在', 404);

  let body: {
    title?: string;
    extractedText?: string;
    roles?: string[];
    pagePaths?: unknown;
    publishStatus?: PublishStatus;
  };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const title = body.title?.trim() || current.title;
  const extractedText = body.extractedText !== undefined ? body.extractedText : current.extractedText;
  const pagePaths = body.pagePaths !== undefined ? parsePagePaths(body.pagePaths) : current.pagePaths;
  let publishStatus = current.publishStatus;
  let publishedAt = current.publishedAt;
  let publishedBy = current.publishedBy;
  if (body.publishStatus === 'published' || body.publishStatus === 'draft' || body.publishStatus === 'archived') {
    publishStatus = body.publishStatus;
    if (publishStatus === 'published') {
      if (current.extractStatus !== 'ready' || !(extractedText ?? '').trim()) {
        return error('抽出正文後才能發布', 400);
      }
      publishedAt = new Date().toISOString();
      publishedBy = auth.id;
    }
  }

  if (body.roles) {
    const roles = body.roles.filter((r) => isValidHelpRole(slug, r));
    if (!roles.length) return error('請至少選擇一個適用角色', 400);
    await replaceDocumentRoles(context.env, id, roles);
  }

  await withProductHelp(context.env, async () => {
    const sql = getSql(context.env);
    await sql`
      UPDATE cs_knowledge_documents SET
        title = ${title},
        extracted_text = ${extractedText},
        page_paths = ${JSON.stringify(pagePaths)}::jsonb,
        publish_status = ${publishStatus},
        published_at = ${publishedAt},
        published_by = ${publishedBy}
      WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid
    `;
  });

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: publishStatus !== current.publishStatus ? 'help.document.status' : 'help.document.updated',
    entityType: 'cs_knowledge_document',
    entityId: id,
    beforeState: { publishStatus: current.publishStatus },
    afterState: { publishStatus, title },
  });

  const document = await getCsDocument(context.env, brand.id, id);
  return json({ document });
};

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const current = await getCsDocument(context.env, brand.id, id);
  if (!current) return error('文件不存在', 404);

  await withProductHelp(context.env, async () => {
    const sql = getSql(context.env);
    await sql`DELETE FROM cs_knowledge_documents WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid`;
  });
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'help.document.deleted',
    entityType: 'cs_knowledge_document',
    entityId: id,
    beforeState: { title: current.title },
  });
  return json({ ok: true });
};
