import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { handleLineNetworkEvents, verifyLineSignature, type LineWebhookBody } from '../../../_shared/network-line';

export const onRequestGet: PagesFunction<Env> = async () => {
  return new Response('FIXERCOWORK network LINE webhook', { status: 200 });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const secret = context.env.LINE_NETWORK_CHANNEL_SECRET;
  if (!secret || !context.env.LINE_NETWORK_CHANNEL_ACCESS_TOKEN) {
    // LINE 驗證鈕只要求 200；secret 尚未設定時先讓驗證通過，事件稍後再處理
    return new Response('OK');
  }

  const rawBody = await context.request.text();
  const signature = context.request.headers.get('x-line-signature');
  const ok = await verifyLineSignature(rawBody, signature, secret);
  if (!ok) return new Response('invalid signature', { status: 401 });

  let body: LineWebhookBody = {};
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  context.waitUntil(handleLineNetworkEvents(context.env, body));
  return new Response('OK');
};
