import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import {
  applyKnowledgeEdit,
  canEditBrandKnowledge,
  listBrandVersions,
  type KnowledgeAction,
  type KnowledgeSection,
} from '../../../_shared/brand-knowledge';

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!canEditBrandKnowledge(auth)) return error('唯讀帳號不能改品牌智慧', 403);

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    section?: KnowledgeSection;
    action?: KnowledgeAction;
    id?: string;
    payload?: Record<string, unknown>;
  };
  if (!body.section || !body.action) return error('請指定 section 與 action', 400);

  try {
    const { item, draft } = await applyKnowledgeEdit(context.env, brand.id, auth, {
      section: body.section,
      action: body.action,
      id: body.id,
      payload: body.payload,
    });
    return json({
      item,
      draft,
      versions: await listBrandVersions(context.env, brand.id),
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : '儲存失敗', 400);
  }
};
