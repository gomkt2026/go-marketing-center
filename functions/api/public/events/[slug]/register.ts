import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { getSql } from '../../../../_shared/db';
import { rowToCamel } from '../../../../_shared/case';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import { generateToken, isValidTaiwanMobile, normalizePhone } from '../../../../_shared/token';
import { getEventBySlug, getEventSessions, getSessionRegisteredCounts } from '../../../../_shared/events';

interface RegisterBody {
  name?: string;
  phone?: string;
  email?: string;
  lineId?: string;
  sessionId?: string;
  referrerId?: string;
  referrerName?: string;
  customAnswers?: Record<string, unknown>;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const slug = context.params.slug as string;
  const event = await getEventBySlug(context.env, slug, context.request);
  if (!event) return error('活動不存在', 404);
  if (event.status !== 'open') return error('此活動目前未開放報名', 400);

  let body: RegisterBody;
  try {
    body = await context.request.json() as RegisterBody;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const name = body.name?.trim() ?? '';
  const phone = normalizePhone(body.phone?.trim() ?? '');
  if (!name) return error('請填寫姓名', 400);
  if (!isValidTaiwanMobile(phone)) return error('請輸入有效的台灣手機號碼', 400);

  for (const field of event.formFields) {
    if (field.required) {
      const value = body.customAnswers?.[field.key];
      const emptyArray = Array.isArray(value) && value.length === 0;
      if (value === undefined || value === null || value === '' || emptyArray) {
        return error(`請填寫「${field.label}」`, 400);
      }
    }
  }

  const sql = getSql(context.env);

  if (body.sessionId) {
    const sessions = await getEventSessions(context.env, event.id);
    const session = (sessions as { id: string; capacity: number | null }[]).find((s) => s.id === body.sessionId);
    if (!session) return error('場次不存在', 400);
    if (session.capacity != null) {
      const counts = await getSessionRegisteredCounts(context.env, event.id);
      const registered = counts[session.id] ?? 0;
      if (registered >= session.capacity) return error('該場次名額已滿,請選擇其他場次', 400);
    }
  }

  let referrerId: string | null = null;
  let referrerName: string | null = null;
  if (body.referrerId) {
    const referrerRows = await sql`
      SELECT id, name FROM event_referrers WHERE id = ${body.referrerId}::uuid AND event_id = ${event.id}::uuid AND is_active = true LIMIT 1
    `;
    if (referrerRows.length) referrerId = (referrerRows[0] as { id: string }).id;
  } else if (body.referrerName?.trim()) {
    referrerName = body.referrerName.trim();
  }

  const qrToken = generateToken(24);
  const inserted = await sql`
    INSERT INTO event_registrations (
      event_id, session_id, name, phone, email, line_id,
      referrer_id, referrer_name, custom_answers, qr_token, source
    ) VALUES (
      ${event.id}::uuid, ${body.sessionId ?? null}, ${name}, ${phone},
      ${body.email?.trim() ?? null}, ${body.lineId?.trim() ?? null},
      ${referrerId}, ${referrerName}, ${JSON.stringify(body.customAnswers ?? {})}::jsonb,
      ${qrToken}, 'web'
    )
    RETURNING *
  `;
  const registration = rowToCamel(inserted[0] as Record<string, unknown>);

  await logActivity(context.env, {
    brandId: event.brandId,
    actorType: 'user',
    action: 'event.registration.created',
    entityType: 'event_registration',
    entityId: (inserted[0] as { id: string }).id,
    afterState: registration,
  });

  return json({ registration }, 201);
};
