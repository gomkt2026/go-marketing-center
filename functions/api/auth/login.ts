import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import {
  findAdminUser, findUserByEmail, findUserByUsername, createSessionToken, sessionCookieHeader, SESSION_MAX_AGE_SEC,
  type AuthUser,
} from '../../_shared/auth';
import { verifyPassword } from '../../_shared/password';
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
  if (!username || !password) return error('請輸入帳號與密碼', 400);

  let user: AuthUser | null = null;

  if (env.ADMIN_USERNAME && env.ADMIN_PASSWORD && username === env.ADMIN_USERNAME && password === env.ADMIN_PASSWORD) {
    user = await findAdminUser(env);
    if (!user) {
      return error('找不到 super_admin 使用者,請確認資料庫已執行 seed', 503);
    }
  } else {
    const dbUser = await findUserByUsername(env, username);
    if (dbUser && await verifyPassword(password, dbUser.passwordHash)) {
      const { passwordHash: _ignored, ...safe } = dbUser;
      user = safe;
    } else if (
      env.FIXERCOWORK_USERNAME
      && env.FIXERCOWORK_PASSWORD
      && username === env.FIXERCOWORK_USERNAME
      && password === env.FIXERCOWORK_PASSWORD
    ) {
      user = await findUserByEmail(env, 'manager@fixercowork.tw');
    }
  }

  if (!user) return error('帳號或密碼錯誤', 401);

  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000;
  const token = await createSessionToken({ userId: user.id, exp }, env);

  return json(
    { user },
    200,
    { 'Set-Cookie': sessionCookieHeader(token) },
  );
};
