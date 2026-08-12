import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const brandId = brand.id;

  const [rules, audiences, personas, channels, visuals, keywords, examples, documents, histories, assets] = await Promise.all([
    sql`SELECT * FROM brand_rules WHERE brand_id = ${brandId}::uuid ORDER BY sort_order, created_at`,
    sql`SELECT * FROM brand_audiences WHERE brand_id = ${brandId}::uuid ORDER BY sort_order`,
    sql`SELECT * FROM brand_personas WHERE brand_id = ${brandId}::uuid ORDER BY sort_order`,
    sql`SELECT * FROM brand_channels WHERE brand_id = ${brandId}::uuid ORDER BY platform`,
    sql`SELECT * FROM brand_visuals WHERE brand_id = ${brandId}::uuid ORDER BY sort_order`,
    sql`SELECT * FROM brand_keywords WHERE brand_id = ${brandId}::uuid ORDER BY category, value`,
    sql`SELECT * FROM brand_examples WHERE brand_id = ${brandId}::uuid ORDER BY category, title`,
    sql`SELECT * FROM brand_documents WHERE brand_id = ${brandId}::uuid ORDER BY created_at DESC`,
    sql`SELECT * FROM brand_histories WHERE brand_id = ${brandId}::uuid ORDER BY happened_on DESC`,
    sql`SELECT * FROM brand_assets WHERE brand_id = ${brandId}::uuid AND asset_type = 'image' ORDER BY created_at DESC`,
  ]);

  return json({
    rules: rowsToCamel(rules as Record<string, unknown>[]),
    audiences: rowsToCamel(audiences as Record<string, unknown>[]),
    personas: rowsToCamel(personas as Record<string, unknown>[]),
    channels: rowsToCamel(channels as Record<string, unknown>[]),
    visuals: rowsToCamel(visuals as Record<string, unknown>[]),
    keywords: rowsToCamel(keywords as Record<string, unknown>[]),
    examples: rowsToCamel(examples as Record<string, unknown>[]),
    documents: rowsToCamel(documents as Record<string, unknown>[]),
    histories: rowsToCamel(histories as Record<string, unknown>[]),
    assets: rowsToCamel(assets as Record<string, unknown>[]),
  });
};
