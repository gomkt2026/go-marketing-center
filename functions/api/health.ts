import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_shared/env';
import { getSql } from '../_shared/db';
import { json, error } from '../_shared/response';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const sql = getSql(context.env);
    const rows = await sql`SELECT 1 AS ok`;
    return json({ ok: true, db: rows[0]?.ok === 1 });
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Health check failed', 503);
  }
};
