import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json, error } from '../../../_shared/response';
import { getBrandBySlug } from '../../../_shared/queries';
import { ensureProductHelp } from '../../../_shared/product-help-migrate';
import { logActivity } from '../../../_shared/activity';
import { normalizePhone } from '../../../_shared/token';
import {
  assertTicketRate, clientHash, clientIp, corsHeaders, createTicket, ensureSettings,
  getOrCreateSession, isValidContactPhone, isValidHelpRole, originAllowed, requestHostOrigin, requestOrigin,
  type HelpSource,
} from '../../../_shared/product-help';

function withCors(res: Response, origin: string | null): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const origin = requestOrigin(context.request);
  let body: {
    brand?: string;
    key?: string;
    role?: string;
    sessionId?: string;
    pagePath?: string;
    source?: HelpSource;
    name?: string;
    phone?: string;
    email?: string;
    lineId?: string;
    requestNote?: string;
  };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return withCors(error('Invalid JSON body', 400), origin);
  }

  const slug = (body.brand ?? '').trim();
  const key = (body.key ?? context.request.headers.get('X-Help-Key') ?? '').trim();
  const role = (body.role ?? '').trim();
  const name = (body.name ?? '').trim();
  const phone = normalizePhone(body.phone ?? '');
  const requestNote = (body.requestNote ?? '').trim();
  const source: HelpSource = body.source === 'liff' ? 'liff' : 'web';
  if (!slug) return withCors(error('缺少 brand', 400), origin);
  if (!isValidHelpRole(slug, role)) return withCors(error('角色無效', 400), origin);
  if (!name) return withCors(error('請填寫姓名', 400), origin);
  if (!isValidContactPhone(phone)) return withCors(error('請填寫有效電話', 400), origin);
  if (!requestNote) return withCors(error('請簡述想請協助的事', 400), origin);

  await ensureProductHelp(context.env);

  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return withCors(error('品牌不存在', 404), origin);
  const settings = await ensureSettings(context.env, brand.id);
  if (key !== settings.widgetKey) return withCors(error('widget key 無效', 401), origin);
  if (!originAllowed(settings, origin, requestHostOrigin(context.request, context.env))) {
    return withCors(error('此網域尚未開放嵌入', 403), origin);
  }

  const hash = await clientHash(clientIp(context.request), key);
  const rate = await assertTicketRate(context.env, hash);
  if (rate) return withCors(error(rate, 429), origin);

  const sessionId = body.sessionId
    ? await getOrCreateSession(context.env, {
      sessionId: body.sessionId,
      brandId: brand.id,
      role,
      pagePath: body.pagePath ?? null,
      source,
      widgetKey: key,
      clientHash: hash,
    })
    : null;

  const ticket = await createTicket(context.env, {
    brandId: brand.id,
    sessionId,
    role,
    pagePath: body.pagePath ?? null,
    source,
    name,
    phone,
    email: body.email?.trim() || null,
    lineId: body.lineId?.trim() || null,
    requestNote,
    clientHash: hash,
  });

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    action: 'help.ticket.created',
    entityType: 'product_help_ticket',
    entityId: ticket.id,
    afterState: { role, source },
  });

  return withCors(json({
    ok: true,
    ticketId: ticket.id,
    message: `已交給 ${brand.name} 客服，我們會用你留的方式聯繫。`,
  }), origin);
};
