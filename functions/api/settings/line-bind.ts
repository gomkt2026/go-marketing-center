import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { createBindCode, getBindingForUser, updateBindingPrefs } from '../../_shared/line-ops';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  return json(await getBindingForUser(context.env, auth.id));
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  return json(await createBindCode(context.env, auth.id));
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({})) as {
    notifyReview?: boolean;
    notifyFailed?: boolean;
    unbind?: boolean;
  };
  try {
    return json(await updateBindingPrefs(context.env, auth.id, body));
  } catch (e) {
    return error(e instanceof Error ? e.message : '更新失敗', 400);
  }
};
