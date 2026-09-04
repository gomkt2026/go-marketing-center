import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { ensureProductHelp } from '../../../../_shared/product-help-migrate';
import { countNewTickets, listTickets } from '../../../../_shared/product-help';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  await ensureProductHelp(context.env);

  const status = new URL(context.request.url).searchParams.get('status') ?? undefined;
  const allowed = ['new', 'contacted', 'resolved', 'cancelled'];
  const filter = status && allowed.includes(status) ? status : undefined;
  const [tickets, newCount] = await Promise.all([
    listTickets(context.env, brand.id, filter),
    countNewTickets(context.env, brand.id),
  ]);
  return json({ tickets, newCount });
};
