import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { toClientError } from '../../../../_shared/openai';
import { loadBrandEditor, runEditorChatTurn, listEditorMessages } from '../../../../_shared/editor-agent';
import { withEditorTables } from '../../../../_shared/editor-migrate';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    sessionId?: string;
    message?: string;
    pinned?: { type?: string; id?: string; label?: string } | null;
  };
  if (!body.sessionId) return error('sessionId is required', 400);
  const message = body.message?.trim();
  if (!message) return error('message is required', 400);

  const owned = await withEditorTables(context.env, async () => {
    const sql = getSql(context.env);
    const rows = await sql`
      SELECT id FROM editor_sessions
      WHERE id = ${body.sessionId}::uuid AND brand_id = ${brand.id}::uuid AND user_id = ${auth.id}::uuid
      LIMIT 1
    `;
    return rows.length > 0;
  });
  if (!owned) return error('找不到這場對話', 404);

  const editor = await loadBrandEditor(context.env, brand.id, slug);
  try {
    const result = await runEditorChatTurn(context.env, {
      brandId: brand.id,
      slug,
      brandName: brand.name,
      editor,
      sessionId: body.sessionId,
      userMessage: message,
      pinned: body.pinned ?? null,
      auth,
    });
    const messages = await listEditorMessages(context.env, body.sessionId);
    return json({ reply: result.reply, toolResult: result.toolResult ?? null, messages });
  } catch (e) {
    const mapped = toClientError(e, '小編回覆');
    return error(mapped.message, mapped.status);
  }
};
