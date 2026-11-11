import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { guardBrandRule } from '../../_shared/brand-guard';

export const onRequest: PagesFunction<Env> = async (context) => {
  const blocked = await guardBrandRule(context.request, context.env);
  if (blocked) return blocked;
  return context.next();
};
