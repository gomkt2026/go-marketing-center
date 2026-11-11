import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireSuperAdmin } from '../../_shared/auth';

export const onRequest: PagesFunction<Env> = async (context) => {
  const auth = await requireSuperAdmin(context.request, context.env);
  if (auth instanceof Response) return auth;
  return context.next();
};
