import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { findAdminUser, createSessionToken, sessionCookieHeader, SESSION_MAX_AGE_SEC } from '../../_shared/auth';
import { json, error } from '../../_shared/response';

interface LoginBody {
  username?: string;
  password?: string;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  let body: LoginBody;
  try {
    body = await request.json() as LoginBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const username = body.username?.trim() ?? '';
  const password = body.password ?? '';

  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
    return error('Auth is not configured on server', 503);
  }

  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    return error('帳號或密碼錯誤', 401);
  }

  const admin = await findAdminUser(env);
  if (!admin) {
    return error('找不到 super_admin 使用者,請確認資料庫已執行 seed', 503);
  }

  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const token = await createSessionToken({ userId: admin.id, exp }, env);

  return json(
    { user: admin },
    200,
    { 'Set-Cookie': sessionCookieHeader(token) },
  );
};
