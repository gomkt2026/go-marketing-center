import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { error } from '../../../../_shared/response';
import { threadsOAuthConfigured, threadsRedirectUri, signOAuthState, buildAuthorizeUrl } from '../../../../_shared/threads-oauth';

// 瀏覽器直接導向這裡(不是 fetch),簽好 state 後 302 到 Threads 授權視窗
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  if (!threadsOAuthConfigured(context.env)) {
    return Response.redirect(
      new URL(`/${slug}/social?threads_oauth=error&message=${encodeURIComponent('尚未設定 THREADS_APP_ID / THREADS_APP_SECRET')}`, context.request.url).toString(),
      302,
    );
  }

  const state = await signOAuthState(context.env, { brandId: brand.id, slug: brand.slug, userId: auth.id });
  const redirectUri = threadsRedirectUri(context.env, context.request.url);
  return Response.redirect(buildAuthorizeUrl(context.env, redirectUri, state), 302);
};
