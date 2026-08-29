import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { composeCustomerLineMessage } from '../../../../_shared/brand-profile';
import { isCollateralDocument, toBrandDocument } from '../../../../_shared/documents';

// POST /api/brands/:slug/documents/line-message
// 產出給客戶的 LINE 訊息:選定的 EDM／簡報 + 官網 + 聯絡方式
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    documentIds?: string[];
    customerHint?: string;
  };

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM brand_documents
    WHERE brand_id = ${brand.id}::uuid
      AND (
        source_type IN ('dm', 'presentation')
        OR (source_type IN ('pdf', 'image') AND file_name IS NOT NULL)
      )
    ORDER BY created_at DESC
  `;
  const all = (rows as Record<string, unknown>[]).map(toBrandDocument).filter(isCollateralDocument);
  const wanted = (body.documentIds ?? []).filter(Boolean);
  const docs = wanted.length ? all.filter((d) => wanted.includes(d.id)) : all;
  if (!docs.length && !brand.websiteUrl) {
    return error('請先上傳 EDM／產品簡報,或先在品牌核心填官方網站', 400);
  }

  const { message, files } = await composeCustomerLineMessage(context.env, {
    brandName: brand.name,
    tagline: brand.tagline,
    websiteUrl: brand.websiteUrl,
    websiteNote: brand.websiteNote,
    docs,
    customerHint: body.customerHint,
  });

  return json({
    message,
    files,
    websiteUrl: brand.websiteUrl ?? null,
    websiteNote: brand.websiteNote ?? null,
  });
};
