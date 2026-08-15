import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  const sql = getSql(context.env);
  const steps: string[] = [];

  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS username CITEXT`;
    steps.push('column:username');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
    steps.push('column:password_hash');
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
      ON users (username)
      WHERE username IS NOT NULL
    `;
    steps.push('index:idx_users_username');
    return json({ ok: true, steps });
  } catch (e) {
    return error(e instanceof Error ? `${e.message} (after steps: ${steps.join(', ')})` : 'Migration failed', 500);
  }
};
