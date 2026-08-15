import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, canAccessBrand, forbidden } from '../../_shared/auth';
import { getEventById } from '../../_shared/events';
import { error } from '../../_shared/response';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const onRequest: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const parts = new URL(context.request.url).pathname.split('/').filter(Boolean);
  const eventId = parts[0] === 'api' && parts[1] === 'events' ? parts[2] : undefined;
  if (eventId && UUID_RE.test(eventId)) {
    const event = await getEventById(context.env, eventId);
    if (!event) return error('Event not found', 404);
    if (!canAccessBrand(auth, event.brandId)) return forbidden();
  }

  return context.next();
};
