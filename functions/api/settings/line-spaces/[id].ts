import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { bindLineSpace, getLineSpace, listLineSpaces } from '../../../_shared/line-spaces';

// PUT /api/settings/line-spaces/:id
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin' && auth.role !== 'brand_manager') {
    return error('只有管理者可以綁定機器人群組', 403);
  }

  const id = context.params.id as string;
  const body = await context.request.json().catch(() => ({})) as { brandId?: string | null };
  const sql = getSql(context.env);
  const rows = await sql`
    SELECT conversation_id FROM line_ops_spaces WHERE id = ${id}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到這個群組', 404);
  const conversationId = (rows[0] as { conversation_id: string }).conversation_id;
  const current = await getLineSpace(context.env, conversationId);
  if (!current) return error('找不到這個群組', 404);

  if (auth.role !== 'super_admin') {
    if (!current.brandId || !auth.brandIds.includes(current.brandId)) {
      return error('品牌負責人只能管理已綁在自己品牌下的群', 403);
    }
    if (body.brandId && !auth.brandIds.includes(body.brandId)) {
      return error('不能改綁到其他品牌', 403);
    }
  }

  try {
    const space = await bindLineSpace(context.env, {
      conversationId,
      brandId: body.brandId ?? null,
      actor: auth,
    });
    return json({ space, spaces: await listLineSpaces(context.env, auth) });
  } catch (e) {
    return error(e instanceof Error ? e.message : '綁定失敗', 400);
  }
};
