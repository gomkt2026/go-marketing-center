import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { forgetAuthUser, requireAuth } from '../../_shared/auth';
import { getBrandsForUser, getBrandBySlug } from '../../_shared/queries';
import { json, error, failLoad } from '../../_shared/response';
import { onboardBrand } from '../../_shared/brand-onboard';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  try {
    const brands = await getBrandsForUser(context.env, auth);
    return json({ brands });
  } catch (e) {
    return failLoad('brands', e);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const canCreate = auth.role === 'super_admin' || auth.role === 'brand_manager' || auth.role === 'brand_editor';
  if (!canCreate) return error('只有品牌負責人、品牌編輯或集團管理者可以新增品牌', 403);

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
    voiceGender?: 'male' | 'female';
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
      voiceGender: body.voiceGender,
    }, auth.id, auth.role);
    forgetAuthUser(auth.id);
    const brand = await getBrandBySlug(context.env, created.slug);
    return json({ brand, ...created }, 201);
  } catch (e) {
    return error(e instanceof Error ? e.message : '新增品牌失敗', 400);
  }
};
