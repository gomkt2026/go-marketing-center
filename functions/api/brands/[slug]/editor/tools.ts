import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { toClientError } from '../../../../_shared/openai';
import {
  executeEditorTool, verifyToolSecret, appendEditorMessage,
  type EditorToolArgs, type EditorToolName,
} from '../../../../_shared/editor-agent';

const TOOLS: EditorToolName[] = ['list_context', 'draft_post', 'schedule_post', 'list_schedule'];

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const secretOk = verifyToolSecret(context.request, context.env);
  const auth = secretOk ? null : await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const body = await context.request.json().catch(() => ({})) as EditorToolArgs & { sessionId?: string };
  if (!body.name || !TOOLS.includes(body.name)) return error('未知工具', 400);

  try {
    const result = await executeEditorTool(context.env, {
      brandId: brand.id,
      slug,
      brandName: brand.name,
      auth: auth && !(auth instanceof Response) ? auth : null,
      args: body,
    });
    if (body.sessionId && result.ok) {
      await appendEditorMessage(context.env, body.sessionId, {
        role: 'tool',
        content: result.summary,
        toolName: result.tool,
        toolPayload: result,
      }).catch(() => undefined);
    }
    return json(result);
  } catch (e) {
    const mapped = toClientError(e, '小編工具');
    return error(mapped.message, mapped.status);
  }
};
