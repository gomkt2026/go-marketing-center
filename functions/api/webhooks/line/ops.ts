import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { verifyLineSignature } from '../../../_shared/network-line';
import { handleLineOpsEvents } from '../../../_shared/line-ops';

export const onRequestGet: PagesFunction<Env> = async () => {
  return new Response('GO marketing LINE ops webhook', { status: 200 });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const secret = context.env.LINE_OPS_CHANNEL_SECRET;
  if (!secret || !context.env.LINE_OPS_CHANNEL_ACCESS_TOKEN) {
    return new Response('OK');
  }

  const rawBody = await context.request.text();
  const signature = context.request.headers.get('x-line-signature');
  const ok = await verifyLineSignature(rawBody, signature, secret);
  if (!ok) return new Response('invalid signature', { status: 401 });

  let body: Parameters<typeof handleLineOpsEvents>[1] = {};
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  context.waitUntil(handleLineOpsEvents(context.env, body));
  return new Response('OK');
};
