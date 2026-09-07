import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { classifyVendorAsk, formatMatchText, logNetworkMatch, searchVendors } from '../../../../_shared/network-match';
import { toClientError } from '../../../../_shared/openai';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as { text?: string };
  const text = body.text?.trim() ?? '';
  if (!text) return error('請輸入求廠商訊息', 400);

  try {
    const ask = await classifyVendorAsk(context.env, text);
    const matches = ask.isVendorAsk ? await searchVendors(context.env, brand.id, ask) : [];
    if (ask.isVendorAsk) {
      await logNetworkMatch(context.env, { brandId: brand.id, queryText: text, ask, matches });
    }
    return json({
      ask,
      matches: matches.map((m) => ({ contact: m.contact, score: m.score, reasons: m.reasons })),
      reply: ask.isVendorAsk ? formatMatchText(ask, matches) : '這則訊息不像在找廠商。',
    });
  } catch (e) {
    const client = toClientError(e, '廠商媒合');
    return error(client.message, client.status);
  }
};
