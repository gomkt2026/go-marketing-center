import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { generateToken } from '../../../_shared/token';
import { logActivity } from '../../../_shared/activity';
import {
  buildEventSlug,
  formatBizSessionLabel,
  getEventById,
  getEventReferrers,
  getEventSessions,
} from '../../../_shared/events';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const sourceId = context.params.id as string;
  const source = await getEventById(context.env, sourceId);
  if (!source) return error('Event not found', 404);

  const body = await context.request.json() as {
    title?: string;
    location?: string;
    eventDate?: string;
    status?: 'draft' | 'open' | 'closed' | 'completed';
  };

  const title = (body.title ?? source.title).trim();
  if (!title) return error('title is required', 400);

  const eventSlug = buildEventSlug(title, generateToken(3));
  const staffToken = generateToken(24);
  const status = body.status ?? 'draft';
  const location = body.location !== undefined ? body.location : source.location;
  const eventDate = body.eventDate ?? source.eventDate;

  const sql = getSql(context.env);
  try {
    const inserted = await sql`
      INSERT INTO events (
        brand_id, slug, title, description, location, event_date, status,
        staff_token, form_fields, edm_images, price, price_label, line_add_friend_url, created_by
      ) VALUES (
        ${source.brandId}::uuid, ${eventSlug}, ${title}, ${source.description},
        ${location ?? null}, ${eventDate ?? null}, ${status}::event_status,
        ${staffToken}, ${JSON.stringify(source.formFields)}::jsonb,
        ${JSON.stringify(source.edmImages ?? [])}::jsonb,
        ${source.price}, ${source.priceLabel}, ${source.lineAddFriendUrl}, ${auth.id}::uuid
      )
      RETURNING *
    `;
    const event = rowsToCamel(inserted as Record<string, unknown>[])[0];
    const newId = (inserted[0] as { id: string }).id;

    const sessions = await getEventSessions(context.env, sourceId) as {
      label: string; startsAt?: string | null; capacity?: number | null; sortOrder: number;
    }[];
    const sourceMs = source.eventDate ? new Date(source.eventDate).getTime() : NaN;
    const nextMs = eventDate ? new Date(eventDate).getTime() : NaN;
    const delta = Number.isFinite(sourceMs) && Number.isFinite(nextMs) ? nextMs - sourceMs : 0;
    const regenerateLabel = sessions.length <= 1 && Number.isFinite(nextMs);

    if (sessions.length === 0 && eventDate) {
      await sql`
        INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order)
        VALUES (${newId}::uuid, ${formatBizSessionLabel(eventDate)}, ${eventDate}, NULL, 0)
      `;
    }

    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      let startsAt = s.startsAt ?? null;
      if (startsAt && delta) {
        startsAt = new Date(new Date(startsAt).getTime() + delta).toISOString();
      } else if (!startsAt && eventDate) {
        startsAt = eventDate;
      }
      const label = regenerateLabel && startsAt ? formatBizSessionLabel(startsAt) : s.label;
      await sql`
        INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order)
        VALUES (${newId}::uuid, ${label}, ${startsAt}, ${s.capacity ?? null}, ${s.sortOrder ?? i})
      `;
    }

    const referrers = await getEventReferrers(context.env, sourceId) as {
      name: string; commissionType: string; commissionValue: number; isActive: boolean; sortOrder: number;
    }[];
    for (const r of referrers) {
      await sql`
        INSERT INTO event_referrers (
          event_id, name, commission_type, commission_value, is_active, sort_order
        ) VALUES (
          ${newId}::uuid, ${r.name}, ${r.commissionType}::event_referrer_commission_type,
          ${r.commissionValue}, ${r.isActive}, ${r.sortOrder}
        )
      `;
    }

    await logActivity(context.env, {
      brandId: source.brandId,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'event.duplicated',
      entityType: 'event',
      entityId: newId,
      afterState: { sourceId, event },
    });

    return json({ event }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '複製活動失敗';
    return error(message, 500);
  }
};
