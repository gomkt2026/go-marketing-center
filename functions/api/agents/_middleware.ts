import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { guardAgent } from '../../_shared/brand-guard';

export const onRequest: PagesFunction<Env> = async (context) => {
  const blocked = await guardAgent(context.request, context.env);
  if (blocked) return blocked;
  return context.next();
};
