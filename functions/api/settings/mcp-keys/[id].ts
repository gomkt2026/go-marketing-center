import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { json, error } from '../../../_shared/response';
import { revokeMcpKey } from '../../../_shared/mcp-auth';

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const id = context.params.id;
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return error('找不到這把金鑰', 404);
  try {
    const revoked = await revokeMcpKey(context.env, auth.id, id);
    if (!revoked) return error('找不到這把金鑰', 404);
    return json({ ok: true });
  } catch (e) {
    console.error('[mcp-keys] revoke', e);
    return error('金鑰撤銷失敗', 500);
  }
};
