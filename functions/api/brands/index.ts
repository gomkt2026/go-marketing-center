import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getBrandsForUser, getBrandBySlug } from '../../_shared/queries';
import { json, error } from '../../_shared/response';
import { onboardBrand } from '../../_shared/brand-onboard';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const brands = await getBrandsForUser(context.env, auth);
  return json({ brands });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('只有集團管理者可以新增品牌', 403);

  const body = await context.request.json().catch(() => ({})) as {
    name?: string;
    slug?: string;
    tagline?: string;
    primaryColor?: string;
    industry?: string;
    audience?: string;
    websiteUrl?: string;
    blogBaseUrl?: string;
    ingestBaseUrl?: string;
    cta?: string;
    editorNickname?: string;
  };

  try {
    const created = await onboardBrand(context.env, {
      name: body.name ?? '',
      slug: body.slug ?? '',
      tagline: body.tagline,
      primaryColor: body.primaryColor,
      industry: body.industry ?? '',
      audience: body.audience,
      websiteUrl: body.websiteUrl,
      blogBaseUrl: body.blogBaseUrl,
      ingestBaseUrl: body.ingestBaseUrl,
      cta: body.cta,
      editorNickname: body.editorNickname,
    }, auth.id);
    const brand = await getBrandBySlug(context.env, created.slug);
    return json({ brand, ...created }, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : '新增品牌失敗', 400);
  }
};
