import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { json, error } from '../../_shared/response';
import { ensureCrewLeadTable, insertCrewLead, parseCrewLead, recentCrewLead } from '../../_shared/crew-leads';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = await context.request.json() as Record<string, unknown>;
  } catch {
    return error('請重新填寫後再送出', 400);
  }

  const parsed = parseCrewLead(body);
  if (!parsed.ok) {
    if (parsed.error === 'spam') return json({ ok: true });
    return error(parsed.error, 400);
  }

  try {
    await ensureCrewLeadTable(context.env);
    if (await recentCrewLead(context.env, parsed.value.phone, parsed.value.crewSlug)) {
      return json({ ok: true, duplicate: true });
    }
    await insertCrewLead(context.env, parsed.value);
    return json({ ok: true }, 201);
  } catch (e) {
    console.error('[crew-leads]', e);
    return error('送出失敗，請稍後再試', 500);
  }
};
