import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { listSeasons, withGameSchema } from '../../../_shared/game';

export interface SeasonInput {
  name?: string;
  startsAt?: string;
  endsAt?: string;
  prize?: string;
  topN?: number;
  isActive?: boolean;
}

export function parseSeasonInput(body: SeasonInput): { value?: Required<SeasonInput>; error?: string } {
  const name = String(body.name ?? '').trim();
  const starts = new Date(String(body.startsAt ?? ''));
  const ends = new Date(String(body.endsAt ?? ''));
  const topN = Math.round(Number(body.topN ?? 10));
  if (!name) return { error: '請填賽季名稱' };
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return { error: '請填正確的起訖時間' };
  if (ends <= starts) return { error: '結束時間必須晚於開始時間' };
  if (!Number.isInteger(topN) || topN < 1 || topN > 100) return { error: '得獎名額請填 1–100' };
  return {
    value: {
      name,
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      prize: String(body.prize ?? '').trim(),
      topN,
      isActive: body.isActive !== false,
    },
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);
  return json({ seasons: await listSeasons(context.env) });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);
  let body: SeasonInput;
  try {
    body = await context.request.json() as SeasonInput;
  } catch {
    return error('Invalid JSON body', 400);
  }
  const parsed = parseSeasonInput(body);
  if (!parsed.value) return error(parsed.error ?? '資料不正確', 400);
  const v = parsed.value;
  const sql = getSql(context.env);
  const rows = await withGameSchema(context.env, () => sql`
    INSERT INTO game_seasons (name, starts_at, ends_at, prize, top_n, is_active)
    VALUES (${v.name}, ${v.startsAt}, ${v.endsAt}, ${v.prize}, ${v.topN}, ${v.isActive})
    RETURNING id
  `);
  return json({ ok: true, id: (rows[0] as { id: string }).id }, 201);
};
