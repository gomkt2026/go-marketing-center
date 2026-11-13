import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth, requireBrandAccess } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { twdRate } from '../../../_shared/llm-pricing';
import {
  BRAND_MONTHLY_USD_CAP,
  emptyParts,
  emptyUsage,
  sumParts,
  summarizeBrandParts,
} from '../../../_shared/llm-usage';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  const access = requireBrandAccess(auth, brand.id);
  if (access !== true) return access;

  const rate = twdRate(context.env);
  const capUsd = BRAND_MONTHLY_USD_CAP;
  try {
    const parts = await summarizeBrandParts(context.env, brand.id);
    const totals = sumParts(parts);
    return json({
      ...totals,
      parts,
      rate,
      capUsd,
      overCap: totals.monthCostUsd >= capUsd,
      pendingMigration: false,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/llm_usage/i.test(message)) {
      return json({
        ...emptyUsage(),
        parts: emptyParts(),
        rate,
        capUsd,
        overCap: false,
        pendingMigration: true,
      });
    }
    return error('Token 花費載入失敗', 500);
  }
};
