import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { listLineSpaces } from '../../../_shared/line-spaces';

// GET /api/settings/line-spaces
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin' && auth.role !== 'brand_manager') {
    return error('只有管理者可以看機器人群組', 403);
  }
  try {
    const spaces = await listLineSpaces(context.env, auth);
    return json({ spaces });
  } catch (e) {
    console.error('[line-spaces] list', e);
    return json({ spaces: [] });
  }
};
