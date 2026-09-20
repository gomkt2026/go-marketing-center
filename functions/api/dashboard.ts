import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_shared/env';
import { requireAuth, isSuperAdmin } from '../_shared/auth';
import { getSql } from '../_shared/db';
import { getBrandsForUser } from '../_shared/queries';
import { rowsToCamel } from '../_shared/case';
import { json } from '../_shared/response';
import { ACTION_LABELS } from '../_shared/activity';
import { latestSeoAuditsByBrand } from '../_shared/seo-audit';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sql = getSql(context.env);
  const [brands, pendingProposals, pendingContents, marketSignals, activityRows, campaignStats, seoAudits] = await Promise.all([
    getBrandsForUser(context.env, auth),
    sql`SELECT id, title, brand_id, collaboration_id, status FROM proposals WHERE status = 'pending_decision' ORDER BY created_at DESC`,
    sql`SELECT id, title, brand_id, status, target_platform FROM contents WHERE status = 'pending_review' ORDER BY updated_at DESC`,
    sql`SELECT id, title, brand_id, status, discovered_at FROM market_signals ORDER BY discovered_at DESC LIMIT 10`,
    sql`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 20`,
    sql`
      SELECT cb.brand_id, COUNT(*)::int AS active_count
      FROM campaigns c
      JOIN campaign_brands cb ON cb.campaign_id = c.id
      WHERE c.status = 'active'
      GROUP BY cb.brand_id
    `,
    latestSeoAuditsByBrand(context.env).catch(() => []),
  ]);

  const activeByBrand = (campaignStats as { brand_id: string; active_count: number }[]).reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.brand_id] = r.active_count;
      return acc;
    },
    {},
  );
  const pendingByBrand = (pendingContents as { brand_id: string }[]).reduce<Record<string, number>>((acc, r) => {
    acc[r.brand_id] = (acc[r.brand_id] ?? 0) + 1;
    return acc;
  }, {});

  const allowed = new Set(brands.map((b) => b.id));
  const scoped = <T extends { brandId?: string }>(rows: T[]) =>
    (isSuperAdmin(auth) ? rows : rows.filter((r) => r.brandId && allowed.has(r.brandId)));

  const seoByBrand = Object.fromEntries(
    seoAudits.map((audit) => [audit.brandId, audit]),
  );

  return json({
    brands,
    pendingProposals: scoped(rowsToCamel(pendingProposals as Record<string, unknown>[]) as { brandId?: string }[]),
    pendingContents: scoped(rowsToCamel(pendingContents as Record<string, unknown>[]) as { brandId?: string }[]),
    marketSignals: scoped(rowsToCamel(marketSignals as Record<string, unknown>[]) as { brandId?: string }[]),
    recentActivity: scoped(rowsToCamel(activityRows as Record<string, unknown>[]) as { brandId?: string }[]),
    actionLabels: ACTION_LABELS,
    brandStats: brands.map((b) => {
      const seo = seoByBrand[b.id];
      const p0 = Array.isArray(seo?.findings) ? seo.findings.filter((f) => f.priority === 'P0').length : 0;
      return {
        brandId: b.id,
        activeCampaigns: activeByBrand[b.id] ?? 0,
        pendingContents: pendingByBrand[b.id] ?? 0,
        seoScore: seo?.healthScore ?? null,
        seoAuditedAt: seo?.createdAt ?? null,
        seoP0: p0,
      };
    }),
  });
};
