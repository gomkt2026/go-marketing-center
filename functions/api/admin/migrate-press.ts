import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { json, error } from '../../_shared/response';
import { applyPressMigration } from '../../_shared/press-migrate';

// POST /api/admin/migrate-press
// 生產環境套用 014_press_coverages(idempotent,僅 super_admin)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (auth.role !== 'super_admin') return error('Forbidden', 403);

  try {
    const steps = await applyPressMigration(context.env);
    return json({ ok: true, steps });
  } catch (e) {
    return error(e instanceof Error ? e.message : 'Migration failed', 500);
  }
};
