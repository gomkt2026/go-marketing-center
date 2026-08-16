import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { parsePressUrl } from '../../../../_shared/press-parse';

// POST /api/brands/:slug/press-coverages/parse
// 抓原文連結的 metadata + 有限摘錄，回傳可編輯預覽。不寫入資料庫、不存全文。
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as { url?: string };
  if (!body.url?.trim()) return error('請提供原文連結', 400);

  try {
    const parsed = await parsePressUrl(context.env, body.url, { name: brand.name, slug: brand.slug });
    return json({ parsed });
  } catch (e) {
    return error(e instanceof Error ? e.message : '解析失敗', 400);
  }
};
