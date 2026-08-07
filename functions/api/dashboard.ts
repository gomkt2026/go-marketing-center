import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_shared/env';
import { requireAuth } from '../_shared/auth';
import { getSql } from '../_shared/db';
import { getAllBrands } from '../_shared/queries';
import { rowsToCamel } from '../_shared/case';
import { json } from '../_shared/response';
import { ACTION_LABELS } from '../_shared/activity';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const [brands, pendingProposals, pendingContents, marketSignals, activityRows, campaignStats] = await Promise.all([
    getAllBrands(context.env),
    sql`SELECT id, title, brand_id, collaboration_id, status FROM proposals WHERE status = 'pending_decision' ORDER BY created_at DESC`,
    sql`SELECT id, title, brand_id, status FROM contents WHERE status = 'pending_review' ORDER BY updated_at DESC`,
    sql`SELECT id, title, brand_id, status, discovered_at FROM market_signals ORDER BY discovered_at DESC LIMIT 10`,
    sql`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 20`,
    sql`
      SELECT cb.brand_id, COUNT(*)::int AS active_count
      FROM campaigns c
      JOIN campaign_brands cb ON cb.campaign_id = c.id
      WHERE c.status = 'active'
      GROUP BY cb.brand_id
    `,
  ]);

  const activeByBrand = Object.fromEntries(
    (campaignStats as { brand_id: string; active_count: number }[]).map((r) => [r.brand_id, r.active_count]),
  );
  const pendingByBrand = Object.fromEntries(
    (pendingContents as { brand_id: string }[]).reduce<Record<string, number>>((acc, r) => {
      acc[r.brand_id] = (acc[r.brand_id] ?? 0) + 1;
      return acc;
    }, {}),
  );

  return json({
    brands,
    pendingProposals: rowsToCamel(pendingProposals as Record<string, unknown>[]),
    pendingContents: rowsToCamel(pendingContents as Record<string, unknown>[]),
    marketSignals: rowsToCamel(marketSignals as Record<string, unknown>[]),
    recentActivity: rowsToCamel(activityRows as Record<string, unknown>[]),
    actionLabels: ACTION_LABELS,
    brandStats: brands.map((b) => ({
      brandId: b.id,
      activeCampaigns: activeByBrand[b.id] ?? 0,
      pendingContents: pendingByBrand[b.id] ?? 0,
    })),
  });
};
