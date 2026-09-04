import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { ensureProductHelp } from '../../../../_shared/product-help-migrate';
import {
  answerFromDocs, appendMessage, defaultWelcome, getOrCreateSession, isValidHelpRole,
  loadPublishedDocsForRole, loadSessionMessages, mapChatError, roleLabel, suggestedQuestions,
} from '../../../../_shared/product-help';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);
  await ensureProductHelp(context.env);

  let body: { role?: string; message?: string; sessionId?: string; pagePath?: string };
  try {
    body = await context.request.json() as typeof body;
  } catch {
    return error('Invalid JSON body', 400);
  }

  const role = (body.role ?? '').trim();
  const message = (body.message ?? '').trim();
  if (!isValidHelpRole(slug, role)) return error('請選擇有效角色', 400);
  if (!message) return error('請輸入問題', 400);

  const sessionId = await getOrCreateSession(context.env, {
    sessionId: body.sessionId,
    brandId: brand.id,
    role,
    pagePath: body.pagePath ?? null,
    source: 'admin',
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
    return json({
      sessionId,
      ...result,
      suggestedFollowups: result.suggestedFollowups.length ? result.suggestedFollowups : suggestedQuestions(docs),
      welcome: defaultWelcome(brand.name, roleLabel(slug, role)),
    });
  } catch (e) {
    const mapped = mapChatError(e);
    return error(mapped.message, mapped.status);
  }
};
