import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import {
  loadBrandEditor, loadEditorContext, contextDigest, firstMessageFor, convaiAgentIdForSlug,
} from '../../../../_shared/editor-agent';
import { applyEditorMigration } from '../../../../_shared/editor-migrate';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  await applyEditorMigration(context.env).catch(() => undefined);

  const editor = await loadBrandEditor(context.env, brand.id, slug);
  const deskContext = await loadEditorContext(context.env, brand.id);
  const agentId = convaiAgentIdForSlug(context.env, slug);

  return json({
    editor,
    brand: { id: brand.id, slug, name: brand.name },
    context: deskContext,
    digest: contextDigest(deskContext),
    firstMessage: firstMessageFor(editor, brand.name),
    voiceEnabled: Boolean(context.env.ELEVENLABS_API_KEY && agentId),
    convaiConfigured: Boolean(agentId),
  });
};
