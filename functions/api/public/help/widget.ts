import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { helpWidgetScript } from '../../../_shared/help-widget';
import { corsHeaders, requestOrigin } from '../../../_shared/product-help';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const origin = requestOrigin(context.request);
  return new Response(helpWidgetScript(), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders(origin),
    },
  });
};
