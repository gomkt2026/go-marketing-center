import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import {
  canEditBrandKnowledge,
  canPublishBrandVersion,
  getOrCreateDraft,
  listBrandVersions,
  publishDraft,
} from '../../../_shared/brand-knowledge';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const versions = await listBrandVersions(context.env, brand.id);
  return json({
    versions,
    draft: versions.find((v) => v.status === 'draft') ?? null,
    published: versions.find((v) => v.status === 'published') ?? null,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    action?: 'draft' | 'publish';
    note?: string;
  };
  const action = body.action ?? 'draft';

  try {
    if (action === 'publish') {
      if (!canPublishBrandVersion(auth)) return error('沒有發布品牌版本的權限', 403);
      const result = await publishDraft(context.env, brand.id, auth, body.note);
      return json({
        published: result.published,
        draft: null,
        versions: result.versions,
      });
    }
    if (!canEditBrandKnowledge(auth)) return error('唯讀帳號不能建立草稿', 403);
    const draft = await getOrCreateDraft(context.env, brand.id, auth.displayName);
    return json({
      draft,
      published: (await listBrandVersions(context.env, brand.id)).find((v) => v.status === 'published') ?? null,
      versions: await listBrandVersions(context.env, brand.id),
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : '操作失敗', 400);
  }
};
