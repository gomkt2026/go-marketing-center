import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireSuperAdmin } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';
import { twdRate } from '../../_shared/llm-pricing';
import {
  BRAND_MONTHLY_USD_CAP,
  addUsage,
  emptyParts,
  emptyUsage,
  sumParts,
  summarizeAllUsage,
  summarizeOfficeUsage,
  type UsageParts,
  type UsageTotals,
} from '../../_shared/llm-usage';

function withOffice(parts: UsageParts, office: UsageTotals): UsageParts {
  return { ...parts, other: addUsage(parts.other, office) };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireSuperAdmin(context.request, context.env);
  if (auth instanceof Response) return auth;

  const rate = twdRate(context.env);
  const capUsd = BRAND_MONTHLY_USD_CAP;
  try {
    const sql = getSql(context.env);
    const [brandRows, rollup, office] = await Promise.all([
      sql`
        SELECT id, slug, name
        FROM brands
        WHERE is_active = true
        ORDER BY name
      `,
      summarizeAllUsage(context.env),
      summarizeOfficeUsage(context.env),
    ]);

    const brands = (brandRows as { id: string; slug: string; name: string }[]).map((brand) => {
      const parts = rollup.byBrand.get(brand.id) ?? emptyParts();
      const totals = sumParts(parts);
      return {
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        ...totals,
        parts,
        overCap: totals.monthCostUsd >= capUsd,
      };
    }).sort((a, b) => b.costUsd - a.costUsd || a.name.localeCompare(b.name, 'zh-Hant'));

    const crossParts = withOffice(rollup.cross, office);
    const cross = { ...sumParts(crossParts), parts: crossParts };
    const total = brands.reduce<UsageTotals>((sum, brand) => addUsage(sum, brand), cross);
    return json({ rate, capUsd, brands, cross, total, pendingMigration: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/llm_usage/i.test(message)) {
      const cross = { ...emptyUsage(), parts: emptyParts() };
      return json({
        rate,
        capUsd,
        brands: [],
        cross,
        total: emptyUsage(),
        pendingMigration: true,
      });
    }
    return error('Token 花費載入失敗', 500);
  }
};
