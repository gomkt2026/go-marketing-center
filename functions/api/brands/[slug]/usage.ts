import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getBrandBySlug } from '../../../_shared/queries';
import { json, error } from '../../../_shared/response';
import { twdRate } from '../../../_shared/llm-pricing';
import { emptyUsage, summarizeBrandUsage } from '../../../_shared/llm-usage';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const rate = twdRate(context.env);
  try {
    const usage = await summarizeBrandUsage(context.env, brand.id);
    return json({ ...usage, rate, pendingMigration: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (/llm_usage/i.test(message)) {
      return json({ ...emptyUsage(), rate, pendingMigration: true });
    }
    return error('Token 花費載入失敗', 500);
  }
};
