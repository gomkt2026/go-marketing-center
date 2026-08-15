import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { error } from '../../../_shared/response';
import { getEventById } from '../../../_shared/events';

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const eventId = context.params.id as string;
  const event = await getEventById(context.env, eventId);
  if (!event) return error('Event not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT r.name, r.phone, r.email, r.line_id, s.label AS session_label,
      COALESCE(ref.name, r.referrer_name, '') AS referrer_display,
      r.custom_answers, r.status,
      r.checked_in_at, r.created_at
    FROM event_registrations r
    LEFT JOIN event_sessions s ON s.id = r.session_id
    LEFT JOIN event_referrers ref ON ref.id = r.referrer_id
    WHERE r.event_id = ${eventId}::uuid
    ORDER BY r.created_at ASC
  `;

  const customKeys = Array.from(
    new Set(
      (rows as { custom_answers: Record<string, unknown> }[])
        .flatMap((r) => Object.keys(r.custom_answers ?? {})),
    ),
  );
  const formFieldLabels = new Map(event.formFields.map((f) => [f.key, f.label]));

  const header = [
    '姓名', '手機', 'Email', 'LINE ID', '場次', '推薦人',
    ...customKeys.map((k) => formFieldLabels.get(k) ?? k),
    '狀態', '報到時間', '報名時間',
  ];

  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows as Record<string, unknown>[]) {
    const customAnswers = (r.custom_answers as Record<string, unknown>) ?? {};
    lines.push([
      r.name, r.phone, r.email, r.line_id, r.session_label, r.referrer_display,
      ...customKeys.map((k) => {
        const v = customAnswers[k];
        return Array.isArray(v) ? v.join('、') : v;
      }),
      r.status === 'cancelled' ? '已取消' : '已報名',
      r.checked_in_at ? new Date(r.checked_in_at as string).toLocaleString('zh-TW') : '',
      new Date(r.created_at as string).toLocaleString('zh-TW'),
    ].map(csvEscape).join(','));
  }

  const csv = '\uFEFF' + lines.join('\n');
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${event.slug}-registrations.csv"`,
    },
  });
};
