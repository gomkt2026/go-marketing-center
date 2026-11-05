import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { createMcpKey, listMcpKeys } from '../../_shared/mcp-auth';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  try {
    return json({ keys: await listMcpKeys(context.env, auth.id) });
  } catch (e) {
    console.error('[mcp-keys] list', e);
    return error('金鑰列表載入失敗', 500);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({})) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name : '';
  try {
    return json(await createMcpKey(context.env, auth.id, name), 201);
  } catch (e) {
    console.error('[mcp-keys] create', e);
    return error('金鑰產生失敗', 500);
  }
};
