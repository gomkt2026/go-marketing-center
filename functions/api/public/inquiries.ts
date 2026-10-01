import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { json, error } from '../../_shared/response';
import { ensureInquiryTable, insertInquiry, parseInquiry, recentInquiry } from '../../_shared/inquiries';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: Record<string, unknown>;
  try {
    body = await context.request.json() as Record<string, unknown>;
  } catch {
    return error('請重新填寫後再送出', 400);
  }

  const parsed = parseInquiry(body);
  if (!parsed.ok) {
    if (parsed.error === 'spam') return json({ ok: true });
    return error(parsed.error, 400);
  }

  try {
    await ensureInquiryTable(context.env);
    if (await recentInquiry(context.env, parsed.value.phone)) {
      return json({ ok: true, duplicate: true });
    }
    await insertInquiry(context.env, parsed.value);
    return json({ ok: true }, 201);
  } catch (e) {
    console.error('[inquiries]', e);
    return error('送出失敗，請稍後再試，或改寄信給我們', 500);
  }
};
