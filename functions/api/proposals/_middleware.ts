import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { guardProposal } from '../../_shared/brand-guard';

export const onRequest: PagesFunction<Env> = async (context) => {
  const blocked = await guardProposal(context.request, context.env);
  if (blocked) return blocked;
  return context.next();
};
