import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { toPressCoverage } from '../../../_shared/press';
import { toBrandDocument } from '../../../_shared/documents';
import { applyDocumentCollateralMigration, isMissingDocumentCollateral } from '../../../_shared/document-migrate';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const brandId = brand.id;

  let documentRows: Record<string, unknown>[] = [];
  try {
    documentRows = await sql`SELECT * FROM brand_documents WHERE brand_id = ${brandId}::uuid ORDER BY created_at DESC` as Record<string, unknown>[];
  } catch (e) {
    if (isMissingDocumentCollateral(e)) {
      await applyDocumentCollateralMigration(context.env).catch(() => undefined);
      documentRows = await sql`SELECT * FROM brand_documents WHERE brand_id = ${brandId}::uuid ORDER BY created_at DESC`.catch(() => []) as Record<string, unknown>[];
    }
  }

  const [rules, audiences, personas, channels, visuals, keywords, examples, histories, assets, coverages, releases] = await Promise.all([
    sql`SELECT * FROM brand_rules WHERE brand_id = ${brandId}::uuid ORDER BY sort_order, created_at`,
    sql`SELECT * FROM brand_audiences WHERE brand_id = ${brandId}::uuid ORDER BY sort_order`,
    sql`SELECT * FROM brand_personas WHERE brand_id = ${brandId}::uuid ORDER BY sort_order`,
    sql`SELECT * FROM brand_channels WHERE brand_id = ${brandId}::uuid ORDER BY platform`,
    sql`SELECT * FROM brand_visuals WHERE brand_id = ${brandId}::uuid ORDER BY sort_order`,
    sql`SELECT * FROM brand_keywords WHERE brand_id = ${brandId}::uuid ORDER BY category, value`,
    sql`SELECT * FROM brand_examples WHERE brand_id = ${brandId}::uuid ORDER BY category, title`,
    sql`SELECT * FROM brand_histories WHERE brand_id = ${brandId}::uuid ORDER BY happened_on DESC`,
    sql`SELECT * FROM brand_assets WHERE brand_id = ${brandId}::uuid AND asset_type = 'image' ORDER BY created_at DESC`,
    sql`SELECT * FROM press_coverages WHERE brand_id = ${brandId}::uuid ORDER BY CASE status WHEN 'inbox' THEN 0 WHEN 'published' THEN 1 WHEN 'syndicated' THEN 2 ELSE 3 END, published_on DESC NULLS LAST`.catch(() => []),
    sql`SELECT * FROM press_releases WHERE brand_id = ${brandId}::uuid ORDER BY updated_at DESC`.catch(() => []),
  ]);

  return json({
    rules: rowsToCamel(rules as Record<string, unknown>[]),
    audiences: rowsToCamel(audiences as Record<string, unknown>[]),
    personas: rowsToCamel(personas as Record<string, unknown>[]),
    channels: rowsToCamel(channels as Record<string, unknown>[]),
    visuals: rowsToCamel(visuals as Record<string, unknown>[]),
    keywords: rowsToCamel(keywords as Record<string, unknown>[]),
    examples: rowsToCamel(examples as Record<string, unknown>[]),
    documents: documentRows.map(toBrandDocument),
    histories: rowsToCamel(histories as Record<string, unknown>[]),
    assets: rowsToCamel(assets as Record<string, unknown>[]),
    pressCoverages: (coverages as Record<string, unknown>[]).map(toPressCoverage),
    pressReleases: rowsToCamel(releases as Record<string, unknown>[]),
  });
};
