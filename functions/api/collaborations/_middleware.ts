import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { guardCollaboration } from '../../_shared/brand-guard';

export const onRequest: PagesFunction<Env> = async (context) => {
  const blocked = await guardCollaboration(context.request, context.env);
  if (blocked) return blocked;
  return context.next();
};
