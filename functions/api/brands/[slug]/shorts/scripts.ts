import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth, requireBrandAccess } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { ingestScriptText } from '../../../../_shared/short-scripts';

// POST /api/brands/:slug/shorts/scripts
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const brand = await getBrandBySlug(context.env, context.params.slug as string);
  if (!brand) return error('Brand not found', 404);
  const access = requireBrandAccess(auth, brand.id);
  if (access instanceof Response) return access;

  const body = await context.request.json().catch(() => ({})) as {
    text?: string;
    title?: string;
    replace?: boolean;
  };
  const text = [body.title ? `《${body.title.trim()}》` : '', body.text ?? ''].filter(Boolean).join('\n').trim();
  if (!text) return error('請貼上腳本內容', 400);

  try {
    const result = await ingestScriptText(context.env, {
      brandId: brand.id,
      brandSlug: brand.slug,
      text,
      createdBy: auth.id,
      source: 'web',
      replace: body.replace !== false,
    });
    return json({ jobs: result.jobs, titles: result.titles, created: result.created, updated: result.updated }, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : '儲存腳本失敗', 400);
  }
};
