import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, isSuperAdmin, forbidden } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, error } from '../../_shared/response';
import { logActivity } from '../../_shared/activity';
import { getSocialSafetyPolicy, clampSafetyValue } from '../../_shared/social-safety';

// 整個行銷中心的社群對外操作安全政策(組織停止開關、每日預算、重複內容視窗、作者冷卻)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  return json({ policy: await getSocialSafetyPolicy(context.env), canEdit: isSuperAdmin(auth) });
};

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth)) return forbidden('只有集團管理者可以修改組織安全政策');

  const body = await context.request.json() as {
    orgPaused?: boolean;
    dailyActionBudget?: number;
    duplicateWindowHours?: number;
    authorCooldownSeconds?: number;
  };
  const before = await getSocialSafetyPolicy(context.env);
  const next = {
    orgPaused: typeof body.orgPaused === 'boolean' ? body.orgPaused : before.orgPaused,
    dailyActionBudget: body.dailyActionBudget !== undefined
      ? clampSafetyValue('dailyActionBudget', body.dailyActionBudget, before.dailyActionBudget)
      : before.dailyActionBudget,
    duplicateWindowHours: body.duplicateWindowHours !== undefined
      ? clampSafetyValue('duplicateWindowHours', body.duplicateWindowHours, before.duplicateWindowHours)
      : before.duplicateWindowHours,
    authorCooldownSeconds: body.authorCooldownSeconds !== undefined
      ? clampSafetyValue('authorCooldownSeconds', body.authorCooldownSeconds, before.authorCooldownSeconds)
      : before.authorCooldownSeconds,
  };

  const sql = getSql(context.env);
  try {
    await sql`
      INSERT INTO social_safety_policy (id, org_paused, daily_action_budget, duplicate_window_hours, author_cooldown_seconds, updated_by, updated_at)
      VALUES (1, ${next.orgPaused}, ${next.dailyActionBudget}, ${next.duplicateWindowHours}, ${next.authorCooldownSeconds}, ${auth.id}::uuid, now())
      ON CONFLICT (id) DO UPDATE SET
        org_paused = EXCLUDED.org_paused,
        daily_action_budget = EXCLUDED.daily_action_budget,
        duplicate_window_hours = EXCLUDED.duplicate_window_hours,
        author_cooldown_seconds = EXCLUDED.author_cooldown_seconds,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
    `;
  } catch (e) {
    return error(`儲存失敗(請確認已執行 057 migration):${e instanceof Error ? e.message : e}`, 500);
  }

  await logActivity(context.env, {
    actorType: 'user',
    actorUserId: auth.id,
    action: before.orgPaused !== next.orgPaused
      ? (next.orgPaused ? 'social_safety.org_paused' : 'social_safety.org_resumed')
      : 'social_safety.updated',
    entityType: 'social_safety_policy',
    beforeState: {
      orgPaused: before.orgPaused, dailyActionBudget: before.dailyActionBudget,
      duplicateWindowHours: before.duplicateWindowHours, authorCooldownSeconds: before.authorCooldownSeconds,
    },
    afterState: next,
  });

  return json({ policy: await getSocialSafetyPolicy(context.env), canEdit: true });
};
