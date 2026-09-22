import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { listLineSpaces, refreshLineSpaceProfile } from '../../../_shared/line-spaces';

// GET /api/settings/line-spaces
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin' && auth.role !== 'brand_manager') {
    return error('只有管理者可以看機器人群組', 403);
  }
  try {
    const spaces = await listLineSpaces(context.env, auth);
    for (const space of spaces.filter((s) => s.status === 'active' && !s.displayName).slice(0, 8)) {
      await refreshLineSpaceProfile(context.env, {
        conversationId: space.conversationId,
        spaceType: space.spaceType,
      }).catch(() => undefined);
    }
    const refreshed = await listLineSpaces(context.env, auth);
    return json({ spaces: refreshed });
  } catch (e) {
    return error(e instanceof Error ? e.message : '讀取群組失敗', 500);
  }
};
