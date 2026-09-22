import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { collectSignalsForBrand } from '../../../_shared/market-collect';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT * FROM market_signals
    WHERE brand_id = ${brand.id}::uuid
    ORDER BY discovered_at DESC
  `;
  return json({ signals: rowsToCamel(rows as Record<string, unknown>[]) });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  try {
    const inserted = await collectSignalsForBrand(context.env, brand);
    return json({
      inserted,
      message: inserted > 0
        ? `已新增 ${inserted} 則情報`
        : '這一輪沒有新的高相關議題（近 14 天重複的不會再寫入）',
    });
  } catch (err) {
    return error(err instanceof Error ? err.message : '蒐集失敗', 500);
  }
};
