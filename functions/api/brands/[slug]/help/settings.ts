import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { ensureProductHelp } from '../../../../_shared/product-help-migrate';
import { ensureSettings, listRecentSessions, rolesForBrand, saveSettings } from '../../../../_shared/product-help';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  await ensureProductHelp(context.env);

  const settings = await ensureSettings(context.env, brand.id);
  const sessions = await listRecentSessions(context.env, brand.id);
  return json({
    settings,
    roles: rolesForBrand(slug),
    brand: { name: brand.name, slug: brand.slug, primaryColor: brand.primaryColor },
    sessions,
  });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  let body: { welcomeByRole?: Record<string, string>; origins?: string[]; rotateKey?: boolean };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const settings = await saveSettings(context.env, brand.id, {
    welcomeByRole: body.welcomeByRole,
    origins: body.origins,
    rotateKey: body.rotateKey === true,
  });
  return json({ settings });
};
