import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { logActivity } from '../../../../_shared/activity';
import {
  loadBrandEditor, loadEditorContext, contextDigest, firstMessageFor,
  convaiAgentIdForSlug, issueConvaiSession, listEditorMessages, brandFrameVariable,
} from '../../../../_shared/editor-agent';
import { withEditorTables } from '../../../../_shared/editor-migrate';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sessionId = new URL(context.request.url).searchParams.get('sessionId');
  if (!sessionId) return error('sessionId is required', 400);

  const session = await withEditorTables(context.env, async () => {
    const sql = getSql(context.env);
    const rows = await sql`
      SELECT id, status, elevenlabs_conversation_id, pinned_context, created_at
      FROM editor_sessions
      WHERE id = ${sessionId}::uuid AND brand_id = ${brand.id}::uuid AND user_id = ${auth.id}::uuid
      LIMIT 1
    `;
    return rows[0] as Record<string, unknown> | undefined;
  });
  if (!session) return error('找不到這場對話', 404);

  const messages = await listEditorMessages(context.env, sessionId);
  return json({
    session: {
      id: session.id,
      status: session.status,
      elevenlabsConversationId: session.elevenlabs_conversation_id ?? null,
      pinnedContext: session.pinned_context ?? {},
    },
    messages,
  });
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const editor = await loadBrandEditor(context.env, brand.id, slug);
  const deskContext = await loadEditorContext(context.env, brand.id);
  const digest = contextDigest(deskContext);

  const created = await withEditorTables(context.env, async () => {
    const sql = getSql(context.env);
    const rows = await sql`
      INSERT INTO editor_sessions (brand_id, user_id, agent_id, status)
      VALUES (${brand.id}::uuid, ${auth.id}::uuid, ${editor.agentId}, 'active')
      RETURNING id
    `;
    return (rows[0] as { id: string }).id;
  });

  const convaiId = convaiAgentIdForSlug(context.env, slug);
  let signedUrl: string | undefined;
  let conversationToken: string | undefined;
  if (convaiId && context.env.ELEVENLABS_API_KEY) {
    try {
      const issued = await issueConvaiSession(context.env, convaiId);
      signedUrl = issued.signedUrl;
      conversationToken = issued.conversationToken;
    } catch (e) {
      console.error('[editor] convai session', e);
    }
  }

  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'editor.session',
    entityType: 'editor_session',
    entityId: created,
  });

  return json({
    sessionId: created,
    editor,
    firstMessage: firstMessageFor(editor, brand.name),
    voiceEnabled: Boolean(signedUrl || conversationToken),
    signedUrl: signedUrl ?? null,
    conversationToken: conversationToken ?? null,
    convaiAgentId: convaiId,
    dynamicVariables: {
      brand_name: brand.name,
      editor_name: editor.nickname,
      recent_press: digest,
      brand_frame: brandFrameVariable(brand.name, slug),
    },
  }, 201);
};

export const onRequestPatch: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as {
    sessionId?: string;
    elevenlabsConversationId?: string;
    pinnedContext?: unknown;
    status?: 'active' | 'ended';
  };
  if (!body.sessionId) return error('sessionId is required', 400);

  await withEditorTables(context.env, async () => {
    const sql = getSql(context.env);
    await sql`
      UPDATE editor_sessions SET
        elevenlabs_conversation_id = coalesce(${body.elevenlabsConversationId ?? null}, elevenlabs_conversation_id),
        pinned_context = coalesce(${body.pinnedContext ? JSON.stringify(body.pinnedContext) : null}::jsonb, pinned_context),
        status = coalesce(${body.status ?? null}, status),
        updated_at = now()
      WHERE id = ${body.sessionId}::uuid AND brand_id = ${brand.id}::uuid AND user_id = ${auth.id}::uuid
    `;
  });
  return json({ ok: true });
};
