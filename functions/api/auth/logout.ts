import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { clearSessionCookieHeader } from '../../_shared/auth';
import { json } from '../../_shared/response';

export const onRequestPost: PagesFunction<Env> = async () => {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookieHeader() });
};
