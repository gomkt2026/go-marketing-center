import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { getAuthUser } from '../../_shared/auth';
import { json } from '../../_shared/response';

/** 公開頁也會打這支確認登入狀態。沒有工作階段時回 200，避免瀏覽器把每次造訪記成 401。受保護的 API 仍由 requireAuth 回 401。 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const user = await getAuthUser(context.request, context.env);
  return json({ user: user ?? null });
};
