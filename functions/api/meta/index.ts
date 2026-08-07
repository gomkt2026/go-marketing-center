import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getUsers, getAgents } from '../../_shared/queries';
import { json } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const [users, agents] = await Promise.all([
    getUsers(context.env),
    getAgents(context.env),
  ]);

  return json({ users, agents });
};
