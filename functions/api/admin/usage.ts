import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireSuperAdmin } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';
import { twdRate } from '../../_shared/llm-pricing';
import { emptyUsage, type UsageTotals } from '../../_shared/llm-usage';

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function add(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    tokens: a.tokens + b.tokens,
    costUsd: a.costUsd + b.costUsd,
    monthTokens: a.monthTokens + b.monthTokens,
    monthCostUsd: a.monthCostUsd + b.monthCostUsd,
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireSuperAdmin(context.request, context.env);
  if (auth instanceof Response) return auth;

  const rate = twdRate(context.env);
  try {
    const sql = getSql(context.env);
    const [brandRows, crossRows, officeRows] = await Promise.all([
      sql`
        SELECT b.id, b.slug, b.name,
          coalesce(sum(u.input_tokens + u.output_tokens), 0)::float AS tokens,
          coalesce(sum(u.cost_usd), 0)::float AS cost_usd,
          coalesce(sum(u.input_tokens + u.output_tokens) FILTER (
            WHERE timezone('Asia/Taipei', u.occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
          ), 0)::float AS month_tokens,
          coalesce(sum(u.cost_usd) FILTER (
            WHERE timezone('Asia/Taipei', u.occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
          ), 0)::float AS month_cost_usd
        FROM brands b
        LEFT JOIN llm_usage u ON u.brand_id = b.id
        WHERE b.is_active = true
        GROUP BY b.id
        ORDER BY coalesce(sum(u.cost_usd), 0) DESC, b.name
      `,
      sql`
        SELECT
          coalesce(sum(input_tokens + output_tokens), 0)::float AS tokens,
          coalesce(sum(cost_usd), 0)::float AS cost_usd,
          coalesce(sum(input_tokens + output_tokens) FILTER (
            WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
          ), 0)::float AS month_tokens,
          coalesce(sum(cost_usd) FILTER (
            WHERE timezone('Asia/Taipei', occurred_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
          ), 0)::float AS month_cost_usd
        FROM llm_usage
        WHERE brand_id IS NULL
      `,
      sql`
        SELECT
          coalesce(sum(input_tokens + output_tokens), 0)::float AS tokens,
          coalesce(sum(cost_usd), 0)::float AS cost_usd,
          coalesce(sum(input_tokens + output_tokens) FILTER (
            WHERE timezone('Asia/Taipei', started_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
          ), 0)::float AS month_tokens,
          coalesce(sum(cost_usd) FILTER (
            WHERE timezone('Asia/Taipei', started_at) >= date_trunc('month', timezone('Asia/Taipei', now()))
          ), 0)::float AS month_cost_usd
        FROM office_standups
      `.catch(() => []),
    ]);

    const brands = (brandRows as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      tokens: num(row.tokens),
      costUsd: num(row.cost_usd),
      monthTokens: num(row.month_tokens),
      monthCostUsd: num(row.month_cost_usd),
    }));
    const crossUsage = crossRows[0] as Record<string, unknown> | undefined;
    const office = (officeRows[0] as Record<string, unknown> | undefined) ?? {};
    const cross = add(
      {
        tokens: num(crossUsage?.tokens),
        costUsd: num(crossUsage?.cost_usd),
        monthTokens: num(crossUsage?.month_tokens),
        monthCostUsd: num(crossUsage?.month_cost_usd),
      },
      {
        tokens: num(office.tokens),
        costUsd: num(office.cost_usd),
        monthTokens: num(office.month_tokens),
        monthCostUsd: num(office.month_cost_usd),
      },
    );
    const total = brands.reduce<UsageTotals>((sum, brand) => add(sum, brand), cross);
    return json({ rate, brands, cross, total, pendingMigration: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/llm_usage/i.test(message)) {
      return json({
        rate,
        brands: [],
        cross: emptyUsage(),
        total: emptyUsage(),
        pendingMigration: true,
      });
    }
    return error('Token 花費載入失敗', 500);
  }
};
