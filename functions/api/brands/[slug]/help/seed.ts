import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../../_shared/env';
import { requireAuth } from '../../../../_shared/auth';
import { getBrandBySlug } from '../../../../_shared/queries';
import { json, error } from '../../../../_shared/response';
import { applyTaskgoHelpSeed } from '../../../../_shared/taskgo-help-migrate';
import { applyHomigoHelpSeed } from '../../../../_shared/homigo-help-migrate';
import { applyWashgoHelpSeed } from '../../../../_shared/washgo-help-migrate';
import { logActivity } from '../../../../_shared/activity';

const SEEDERS = {
  taskgo: applyTaskgoHelpSeed,
  homigo: applyHomigoHelpSeed,
  washgo: applyWashgoHelpSeed,
} as const;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const slug = context.params.slug as string;
  const seeder = SEEDERS[slug as keyof typeof SEEDERS];
  if (!seeder) {
    return error('目前只有 TaskGo、Homigo、Washgo 提供官方操作文件同步', 400);
  }

  const brand = await getBrandBySlug(context.env, slug);
  if (!brand) return error('Brand not found', 404);

  try {
    const result = await seeder(context.env, auth.id);
    await logActivity(context.env, {
      brandId: brand.id,
      actorType: 'user',
      actorUserId: auth.id,
      action: 'help.documents.seeded',
      entityType: 'cs_knowledge_document',
      afterState: { created: result.created, updated: result.updated, count: result.upserted.length },
    });
    return json({ ok: true, ...result });
  } catch (e) {
    return error(e instanceof Error ? e.message : '同步失敗', 500);
  }
};
