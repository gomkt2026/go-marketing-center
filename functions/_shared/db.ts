import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import type { Env } from './env';

/** 與既有 `sql\`...\`` 呼叫相容；Hyperdrive 走 postgres.js，否則 Neon HTTP */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = ((strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>) & {
  unsafe?: (query: string, params?: unknown[]) => Promise<unknown[]>;
};

const sqlCache = new WeakMap<object, SqlTag>();

export function getConnectionString(env: Env): string {
  if (env.HYPERDRIVE?.connectionString) return env.HYPERDRIVE.connectionString;
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return env.DATABASE_URL;
}

export function getSql(env: Env): SqlTag {
  const cached = sqlCache.get(env);
  if (cached) return cached;

  if (env.HYPERDRIVE?.connectionString) {
    const sql = postgres(env.HYPERDRIVE.connectionString, {
      max: 5,
      fetch_types: false,
      prepare: true,
    }) as unknown as SqlTag;
    sqlCache.set(env, sql);
    return sql;
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  const sql = neon(env.DATABASE_URL) as unknown as SqlTag;
  sqlCache.set(env, sql);
  return sql;
}
