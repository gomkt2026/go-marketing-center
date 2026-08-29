import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { applyDocumentCollateralMigration } from '../../_shared/document-migrate';
import { applyBrandWebsiteMigration } from '../../_shared/brand-profile';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  try {
    const steps = [
      ...(await applyDocumentCollateralMigration(context.env)),
      ...(await applyBrandWebsiteMigration(context.env)),
    ];
    return json({ ok: true, steps });
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Migration failed', 500);
  }
};
