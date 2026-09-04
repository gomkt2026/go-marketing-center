import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { corsHeaders, requestOrigin } from '../../../_shared/product-help';

export const onRequest: PagesFunction<Env> = async (context) => {
  const origin = requestOrigin(context.request);
  if (context.request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  return context.next();
};
