import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  const env = context.env;
  return json({
    hyperdrive: Boolean(env.HYPERDRIVE?.connectionString),
    kvCache: Boolean(env.CACHE),
    brandJobsQueue: Boolean(env.BRAND_JOBS),
    databaseUrl: Boolean(env.DATABASE_URL),
    notes: {
      workersPaid: '請在 Cloudflare Dashboard → Workers & Pages → Plans 開 Workers Paid（約 USD $5／月）',
      neonLaunch: '請在 Neon Console 將 org 升 Launch、關閉 scale-to-zero、min 0.25–0.5 CU、autoscale 到 2 CU',
    },
  });
};
