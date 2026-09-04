import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../../_shared/env';
import { requireAuth } from '../../../../../_shared/auth';
import { getBrandBySlug } from '../../../../../_shared/queries';
import { json, error } from '../../../../../_shared/response';
import { logActivity } from '../../../../../_shared/activity';
import { updateTicket, type TicketStatus } from '../../../../../_shared/product-help';

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  let body: { status?: TicketStatus; followupNote?: string };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const allowed: TicketStatus[] = ['new', 'contacted', 'resolved', 'cancelled'];
  if (body.status && !allowed.includes(body.status)) return error('無效的工單狀態', 400);

  const ticket = await updateTicket(context.env, brand.id, id, {
    status: body.status,
    followupNote: body.followupNote,
    assignedTo: auth.id,
  });
  if (!ticket) return error('工單不存在', 404);

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'help.ticket.status_changed',
    entityType: 'product_help_ticket',
    entityId: id,
    afterState: { status: ticket.status },
  });
  return json({ ticket });
};
