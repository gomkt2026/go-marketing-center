import { neon } from '@neondatabase/serverless';
import postgres from 'postgres';
import type { Env } from './env';

/** 與既有 `sql\`...\`` 呼叫相容 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SqlTag = ((strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>) & {
  unsafe?: (query: string, params?: unknown[]) => Promise<unknown[]>;
};

const sqlCache = new WeakMap<object, SqlTag>();

export function getConnectionString(env: Env): string {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return env.DATABASE_URL;
}

function useHyperdrive(env: Env): boolean {
  return Boolean(env.USE_HYPERDRIVE === '1' && env.HYPERDRIVE?.connectionString);
}

export function getSql(env: Env): SqlTag {
  const cached = sqlCache.get(env);
  if (cached) return cached;

  // Neon 未關 scale-to-zero 時，Hyperdrive TCP 容易在喚醒時整批 500。
  // Pages 熱路徑維持 Neon HTTP；scheduler 要走 Hyperdrive 時設 USE_HYPERDRIVE=1。
  if (useHyperdrive(env)) {
    const sql = postgres(env.HYPERDRIVE!.connectionString, {
      max: 5,
      fetch_types: true,
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
