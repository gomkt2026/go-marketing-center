import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { appendEditorMessage, listEditorMessages } from '../../../../_shared/editor-agent';
import { withEditorTables } from '../../../../_shared/editor-migrate';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    sessionId?: string;
    role?: 'user' | 'assistant' | 'tool';
    content?: string;
    toolName?: string;
    toolPayload?: unknown;
  };
  if (!body.sessionId || !body.role || !body.content?.trim()) {
    return error('sessionId, role, content 必填', 400);
  }

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

  await appendEditorMessage(context.env, body.sessionId, {
    role: body.role,
    content: body.content.trim(),
    toolName: body.toolName,
    toolPayload: body.toolPayload,
  });
  const messages = await listEditorMessages(context.env, body.sessionId);
  return json({ ok: true, messages }, 201);
};
