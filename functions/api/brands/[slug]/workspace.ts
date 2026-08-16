import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { toPressCoverage } from '../../../_shared/press';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const brandId = brand.id;

  const [campaigns, contents, signals, learning, histories, coverages] = await Promise.all([
    sql`SELECT COUNT(*)::int AS cnt FROM campaigns c JOIN campaign_brands cb ON cb.campaign_id = c.id WHERE cb.brand_id = ${brandId}::uuid AND c.status = 'active'`,
    sql`SELECT COUNT(*)::int AS cnt FROM contents WHERE brand_id = ${brandId}::uuid AND status = 'pending_review'`,
    sql`SELECT COUNT(*)::int AS cnt FROM market_signals WHERE brand_id = ${brandId}::uuid`,
    sql`SELECT COUNT(*)::int AS cnt FROM learning_records WHERE brand_id = ${brandId}::uuid`,
    sql`SELECT id, brand_id, happened_on, title, description FROM brand_histories WHERE brand_id = ${brandId}::uuid ORDER BY happened_on DESC`,
    sql`SELECT * FROM press_coverages WHERE brand_id = ${brandId}::uuid AND status IN ('published', 'syndicated') ORDER BY published_on DESC NULLS LAST LIMIT 3`.catch(() => []),
  ]);

  return json({
    stats: {
      activeCampaigns: (campaigns[0] as { cnt: number }).cnt,
      pendingContents: (contents[0] as { cnt: number }).cnt,
      marketSignals: (signals[0] as { cnt: number }).cnt,
      learningRecords: (learning[0] as { cnt: number }).cnt,
    },
    histories: (histories as Record<string, unknown>[]).map((h) => ({
      id: h.id,
      brandId: h.brand_id,
      happenedOn: h.happened_on,
      title: h.title,
      description: h.description,
    })),
    pressCoverages: (coverages as Record<string, unknown>[]).map(toPressCoverage),
  });
};
