import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, isSuperAdmin } from '../../_shared/auth';
import { getUsers, getAgents } from '../../_shared/queries';
import { json } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const [users, agents] = await Promise.all([
    getUsers(context.env),
    getAgents(context.env),
  ]);

  if (isSuperAdmin(auth)) return json({ users, agents });

  const allowed = new Set(auth.brandIds);
  const scopedAgents = (agents as { brandId?: string }[]).filter((a) => !a.brandId || allowed.has(a.brandId));
  const scopedUsers = (users as { id: string; role: string }[]).filter((u) => u.id === auth.id || u.role === 'super_admin');
  return json({ users: scopedUsers, agents: scopedAgents });
};
