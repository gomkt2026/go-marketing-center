import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json, error } from '../../../_shared/response';
import { getBrandBySlug } from '../../../_shared/queries';
import { ensureProductHelp } from '../../../_shared/product-help-migrate';
import {
  corsHeaders, defaultWelcome, ensureSettings, isValidHelpRole, loadPublishedDocsForRole,
  originAllowed, requestHostOrigin, requestOrigin, roleLabel, suggestedQuestions,
} from '../../../_shared/product-help';

function withCors(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const origin = requestOrigin(context.request);
  const url = new URL(context.request.url);
  const slug = (url.searchParams.get('brand') ?? '').trim();
  const key = (url.searchParams.get('key') ?? context.request.headers.get('X-Help-Key') ?? '').trim();
  const role = (url.searchParams.get('role') ?? '').trim();
  if (!slug) return withCors(error('缺少 brand', 400), origin);

  await ensureProductHelp(context.env);

  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return withCors(error('品牌不存在', 404), origin);
  const settings = await ensureSettings(context.env, brand.id);
  if (key !== settings.widgetKey) return withCors(error('widget key 無效', 401), origin);
  if (!originAllowed(settings, origin, requestHostOrigin(context.request, context.env))) {
    return withCors(error('此網域尚未開放嵌入', 403), origin);
  }
  if (!isValidHelpRole(slug, role)) return withCors(error('角色無效', 400), origin);

  const docs = await loadPublishedDocsForRole(context.env, brand.id, role);
  const welcome = settings.welcomeByRole[role]?.trim() || defaultWelcome(brand.name, roleLabel(slug, role));
  return withCors(json({
    brand: { name: brand.name, slug: brand.slug, primaryColor: brand.primaryColor },
    role,
    roleLabel: roleLabel(slug, role),
    welcome,
    suggestedQuestions: suggestedQuestions(docs),
    hasDocs: docs.length > 0,
  }), origin);
};
