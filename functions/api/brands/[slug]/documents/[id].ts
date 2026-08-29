import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getSql } from '../../../../_shared/db';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { mediaUrlToKey } from '../../../../_shared/media';
import { logActivity } from '../../../../_shared/activity';
import { isCollateralDocument } from '../../../../_shared/documents';

export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const id = context.params.id as string;
  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  const sql = getSql(context.env);
  const rows = await sql`
    SELECT id, file_url, source_type, title, file_name FROM brand_documents
    WHERE id = ${id}::uuid AND brand_id = ${brand.id}::uuid
    LIMIT 1
  `;
  if (!rows.length) return error('找不到這份文件', 404);
  const doc = rows[0] as {
    id: string; file_url: string | null; source_type: string; title: string; file_name: string | null;
  };
  if (!isCollateralDocument({ sourceType: doc.source_type, fileName: doc.file_name })) {
    return error('種子品牌手冊請走知識條目,不能從這裡刪', 400);
  }

  const key = mediaUrlToKey(doc.file_url);
  if (key && context.env.MEDIA) await context.env.MEDIA.delete(key).catch(() => undefined);

  await sql`DELETE FROM brand_documents WHERE id = ${id}::uuid`;
  await logActivity(context.env, {
    brandId: brand.id,
    actorType: 'user',
    actorUserId: auth.id,
    action: 'brand_document.deleted',
    entityType: 'brand_document',
    entityId: id,
    afterState: { title: doc.title, sourceType: doc.source_type },
  });
  return json({ ok: true });
};
