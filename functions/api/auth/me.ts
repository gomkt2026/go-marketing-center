import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { getAuthUser } from '../../_shared/auth';
import { json, error } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.request, context.env);
  if (!user) return error('Unauthorized', 401);
  return json({ user });
};
