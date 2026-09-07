import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { lineNetworkConfigured, publicWebhookUrl } from '../../../../_shared/network-line';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const line = lineNetworkConfigured(context.env);
  return json({
    line: {
      ...line,
      webhookUrl: publicWebhookUrl(context.env),
      botId: '@612fnwgc',
      appliesToThisBrand: line.brandSlug === slug,
    },
  });
};
