import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { rowsToCamel } from '../../../_shared/case';
import { json, error } from '../../../_shared/response';
import { logActivity } from '../../../_shared/activity';
import {
  getEventById, getEventSessions, getEventReferrers, getSessionRegisteredCounts,
} from '../../../_shared/events';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  const event = await getEventById(context.env, id);
  if (!event) return error('Event not found', 404);

  const [sessions, referrers, registeredCounts] = await Promise.all([
    getEventSessions(context.env, id),
    getEventReferrers(context.env, id),
    getSessionRegisteredCounts(context.env, id),
  ]);

  const sessionsWithRemaining = (sessions as { id: string; capacity: number | null }[]).map((s) => ({
    ...s,
    registeredCount: registeredCounts[s.id] ?? 0,
    remaining: s.capacity == null ? null : Math.max(0, s.capacity - (registeredCounts[s.id] ?? 0)),
  }));

  return json({ event, sessions: sessionsWithRemaining, referrers });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const id = context.params.id as string;
  const before = await getEventById(context.env, id);
  if (!before) return error('Event not found', 404);

  const body = await context.request.json() as {
    title?: string;
    description?: string;
    location?: string;
    eventDate?: string;
    status?: 'draft' | 'open' | 'closed' | 'completed';
    formFields?: unknown[];
    price?: number;
    priceLabel?: string;
    lineAddFriendUrl?: string;
    sessions?: { id?: string; label: string; startsAt?: string; capacity?: number | null; sortOrder?: number }[];
  };

  const nextStatus = body.status ?? before.status;
  const formFieldsJson = body.formFields != null ? JSON.stringify(body.formFields) : null;

  const sql = getSql(context.env);
  try {
    let sessionsToDelete: { id: string }[] = [];
    if (body.sessions) {
      const existing = await getEventSessions(context.env, id) as { id: string }[];
      const incomingIds = new Set(body.sessions.map((s) => s.id).filter((sid): sid is string => Boolean(sid)));
      sessionsToDelete = existing.filter((s) => !incomingIds.has(s.id));
      if (sessionsToDelete.length) {
        const counts = await getSessionRegisteredCounts(context.env, id);
        const blocked = sessionsToDelete.filter((s) => (counts[s.id] ?? 0) > 0);
        if (blocked.length) {
          return error('已有報名的場次不能刪除。請先保留該場次，或把報名改到其他場次後再刪。', 400);
        }
      }
    }

    const updated = formFieldsJson != null
      ? await sql`
          UPDATE events SET
            title = ${body.title ?? before.title},
            description = ${body.description ?? before.description},
            location = ${body.location ?? before.location},
            event_date = ${body.eventDate ?? before.eventDate},
            status = ${nextStatus}::event_status,
            form_fields = ${formFieldsJson}::jsonb,
            price = ${body.price ?? before.price},
            price_label = ${body.priceLabel ?? before.priceLabel},
            line_add_friend_url = ${body.lineAddFriendUrl ?? before.lineAddFriendUrl}
          WHERE id = ${id}::uuid
          RETURNING *
        `
      : await sql`
          UPDATE events SET
            title = ${body.title ?? before.title},
            description = ${body.description ?? before.description},
            location = ${body.location ?? before.location},
            event_date = ${body.eventDate ?? before.eventDate},
            status = ${nextStatus}::event_status,
            price = ${body.price ?? before.price},
            price_label = ${body.priceLabel ?? before.priceLabel},
            line_add_friend_url = ${body.lineAddFriendUrl ?? before.lineAddFriendUrl}
          WHERE id = ${id}::uuid
          RETURNING *
        `;

    if (body.sessions) {
      for (const s of sessionsToDelete) {
        await sql`DELETE FROM event_sessions WHERE id = ${s.id}::uuid AND event_id = ${id}::uuid`;
      }

      for (let i = 0; i < body.sessions.length; i++) {
        const s = body.sessions[i];
        if (!s.label?.trim()) continue;
        if (s.id) {
          await sql`
            UPDATE event_sessions SET
              label = ${s.label.trim()},
              starts_at = ${s.startsAt ?? null},
              capacity = ${s.capacity ?? null},
              sort_order = ${s.sortOrder ?? i}
            WHERE id = ${s.id}::uuid AND event_id = ${id}::uuid
          `;
        } else {
          await sql`
            INSERT INTO event_sessions (event_id, label, starts_at, capacity, sort_order)
            VALUES (${id}::uuid, ${s.label.trim()}, ${s.startsAt ?? null}, ${s.capacity ?? null}, ${s.sortOrder ?? i})
          `;
        }
      }
    }

    const event = rowsToCamel(updated as Record<string, unknown>[])[0];

    try {
      await logActivity(context.env, {
        brandId: before.brandId,
        actorType: 'user',
        actorUserId: auth.id,
        action: 'event.updated',
        entityType: 'event',
        entityId: id,
        beforeState: before,
        afterState: event,
      });
    } catch {
      // 稽核寫入失敗不阻擋管理者儲存
    }

    return json({ event });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新活動失敗';
    return error(message, 500);
  }
};
