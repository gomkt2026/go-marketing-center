import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { discoverPressMentions } from '../../../../_shared/press-parse';

// POST /api/brands/:slug/press-coverages/discover
// 從 Google News + 台灣媒體 RSS 撈品牌名相關報導，只回傳候選清單，不自動入庫。
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  try {
    const items = await discoverPressMentions(context.env, {
      id: brand.id,
      name: brand.name,
      slug: brand.slug,
    });
    return json({ items });
  } catch (e) {
    return error(e instanceof Error ? e.message : '撈取失敗', 500);
  }
};
