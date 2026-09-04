import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { json, error } from '../../../_shared/response';
import { getBrandBySlug } from '../../../_shared/queries';
import { ensureProductHelp } from '../../../_shared/product-help-migrate';
import { logActivity } from '../../../_shared/activity';
import {
  answerFromDocs, appendMessage, assertChatRate, clientHash, clientIp, corsHeaders,
  ensureSettings, getOrCreateSession, isValidHelpRole, loadPublishedDocsForRole,
  loadSessionMessages, mapChatError, originAllowed, requestHostOrigin, requestOrigin, roleLabel,
  suggestedQuestions, type HelpSource,
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
    message?: string;
    sessionId?: string;
    pagePath?: string;
    source?: HelpSource;
  };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return withCors(error('Invalid JSON body', 400), origin);
  }

  const slug = (body.brand ?? '').trim();
  const key = (body.key ?? context.request.headers.get('X-Help-Key') ?? '').trim();
  const role = (body.role ?? '').trim();
  const message = (body.message ?? '').trim();
  const source: HelpSource = body.source === 'liff' ? 'liff' : 'web';
  if (!slug) return withCors(error('缺少 brand', 400), origin);
  if (!isValidHelpRole(slug, role)) return withCors(error('角色無效', 400), origin);
  if (!message) return withCors(error('請輸入問題', 400), origin);
  if (message.length > 2000) return withCors(error('問題太長，請精簡後再問', 400), origin);

  await ensureProductHelp(context.env);

  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return withCors(error('品牌不存在', 404), origin);
  const settings = await ensureSettings(context.env, brand.id);
  if (key !== settings.widgetKey) return withCors(error('widget key 無效', 401), origin);
  if (!originAllowed(settings, origin, requestHostOrigin(context.request, context.env))) {
    return withCors(error('此網域尚未開放嵌入', 403), origin);
  }

  const hash = await clientHash(clientIp(context.request), key);
  const rate = await assertChatRate(context.env, hash);
  if (rate) return withCors(error(rate, 429), origin);

  const sessionId = await getOrCreateSession(context.env, {
    sessionId: body.sessionId,
    brandId: brand.id,
    role,
    pagePath: body.pagePath ?? null,
    source,
    widgetKey: key,
    clientHash: hash,
  });
  await appendMessage(context.env, { sessionId, role: 'user', content: message });

  const docs = await loadPublishedDocsForRole(context.env, brand.id, role);
  const history = await loadSessionMessages(context.env, sessionId);
  try {
    const result = await answerFromDocs(context.env, {
      brandName: brand.name,
      roleLabel: roleLabel(slug, role),
      question: message,
      pagePath: body.pagePath,
      history: history.slice(0, -1),
      docs,
    });
    await appendMessage(context.env, {
      sessionId,
      role: 'assistant',
      content: result.answer,
      answered: result.answered,
      citations: result.citations,
    });
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'ai_agent',
      action: 'help.chat.answered',
      entityType: 'product_help_session',
      entityId: sessionId,
      afterState: { answered: result.answered, role },
    });
    return withCors(json({
      sessionId,
      ...result,
      suggestedFollowups: result.suggestedFollowups.length ? result.suggestedFollowups : suggestedQuestions(docs),
    }), origin);
  } catch (e) {
    const mapped = mapChatError(e);
    return withCors(error(mapped.message, mapped.status), origin);
  }
};
