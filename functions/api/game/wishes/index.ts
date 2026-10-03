import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { withGameSchema } from '../../../_shared/game';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  try {
    const rows = await withGameSchema(context.env, () => {
      const sql = getSql(context.env);
      return sql`
        SELECT id, nickname, body, kind, status, supports, created_at
        FROM game_wishes
        ORDER BY created_at DESC
        LIMIT 200
      `;
    });
    return json({ wishes: rowsToCamel(rows as Record<string, unknown>[]) });
  } catch (e) {
    console.error('[game/wishes/admin]', e);
    return error('留言板載入失敗', 500);
  }
};
