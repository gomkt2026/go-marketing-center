import type { Env } from './env';
import { getSql } from './db';
import { recordSocialApiRequest, textHashOf } from './threads-api-log';

// ============================================================================
// 社群對外操作安全閘門(目前套用在 Threads 發文與回覆)
//   依序檢查:組織停止開關 → 帳號停止開關 → 每日操作預算 → 作者冷卻(回覆) → 重複內容視窗
//   被擋下不算失敗:呼叫端不重試、不發失敗通知,原因寫進 job / 回覆佇列。
// ============================================================================

export interface SocialSafetyPolicy {
  orgPaused: boolean;
  dailyActionBudget: number;
  duplicateWindowHours: number;
  authorCooldownSeconds: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export const DEFAULT_SAFETY_POLICY: SocialSafetyPolicy = {
  orgPaused: false,
  dailyActionBudget: 20,
  duplicateWindowHours: 168,
  authorCooldownSeconds: 86400,
  updatedAt: null,
  updatedBy: null,
};

export const SAFETY_LIMITS = {
  dailyActionBudget: { min: 0, max: 500 },
  duplicateWindowHours: { min: 0, max: 2160 },
  authorCooldownSeconds: { min: 0, max: 2592000 },
} as const;

export function clampSafetyValue(key: keyof typeof SAFETY_LIMITS, value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const { min, max } = SAFETY_LIMITS[key];
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function getSocialSafetyPolicy(env: Env): Promise<SocialSafetyPolicy> {
  try {
    const sql = getSql(env);
    const rows = await sql`
      SELECT org_paused, daily_action_budget, duplicate_window_hours, author_cooldown_seconds, updated_at, updated_by
      FROM social_safety_policy WHERE id = 1
    ` as {
      org_paused: boolean; daily_action_budget: number; duplicate_window_hours: number;
      author_cooldown_seconds: number; updated_at: string | null; updated_by: string | null;
    }[];
    if (!rows.length) return DEFAULT_SAFETY_POLICY;
    const r = rows[0];
    return {
      orgPaused: r.org_paused,
      dailyActionBudget: r.daily_action_budget,
      duplicateWindowHours: r.duplicate_window_hours,
      authorCooldownSeconds: r.author_cooldown_seconds,
      updatedAt: r.updated_at,
      updatedBy: r.updated_by,
    };
  } catch (e) {
    console.warn('[social-safety] 讀取政策失敗,沿用預設值', e instanceof Error ? e.message : e);
    return DEFAULT_SAFETY_POLICY;
  }
}

export type SafetyBlockCode = 'org_paused' | 'account_paused' | 'budget' | 'cooldown' | 'duplicate';

export class ThreadsSafetyBlockedError extends Error {
  readonly code: SafetyBlockCode;
  constructor(code: SafetyBlockCode, reason: string) {
    super(reason);
    this.name = 'ThreadsSafetyBlockedError';
    this.code = code;
  }
}

export function isThreadsSafetyBlocked(e: unknown): e is ThreadsSafetyBlockedError {
  return e instanceof ThreadsSafetyBlockedError
    || (e instanceof Error && e.name === 'ThreadsSafetyBlockedError');
}

/** 台北時間今天 00:00 起,這個帳號成功的對外動作數(發文 + 回覆) */
export async function countTodayActions(env: Env, accountId: string): Promise<number> {
  const sql = getSql(env);
  const rows = await sql`
    SELECT count(*)::int AS n FROM social_api_requests
    WHERE account_id = ${accountId}::uuid
      AND text_hash IS NOT NULL
      AND http_status BETWEEN 200 AND 299
      AND created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Taipei') AT TIME ZONE 'Asia/Taipei')
  ` as { n: number }[];
  return rows[0]?.n ?? 0;
}

export interface SafetyCheckParams {
  accountId: string;
  brandId: string;
  action: 'publish' | 'reply';
  text: string;
  targetUsername?: string | null;
}

export type SafetyCheckResult =
  | { ok: true; textHash: string }
  | { ok: false; code: SafetyBlockCode; reason: string };

export async function checkThreadsSafety(env: Env, params: SafetyCheckParams): Promise<SafetyCheckResult> {
  const sql = getSql(env);
  const textHash = await textHashOf(params.text);
  const policy = await getSocialSafetyPolicy(env);

  const block = async (code: SafetyBlockCode, reason: string): Promise<SafetyCheckResult> => {
    await recordSocialApiRequest(env, {
      accountId: params.accountId, brandId: params.brandId, action: params.action, method: 'POST',
      blockedReason: reason,
    });
    return { ok: false, code, reason };
  };

  if (policy.orgPaused) {
    return block('org_paused', '安全閘門:行銷中心已開啟「組織停止開關」,所有對外發文與回覆暫停');
  }

  let account: { paused: boolean; daily_action_budget: number | null; account_name: string | null } | null = null;
  try {
    const rows = await sql`
      SELECT paused, daily_action_budget, account_name FROM brand_social_accounts
      WHERE id = ${params.accountId}::uuid LIMIT 1
    ` as { paused: boolean; daily_action_budget: number | null; account_name: string | null }[];
    account = rows[0] ?? null;
  } catch (e) {
    console.warn('[social-safety] 讀取帳號停止開關失敗(可能尚未執行 057 migration)', e instanceof Error ? e.message : e);
  }
  const label = account?.account_name ? `@${account.account_name}` : '此帳號';

  if (account?.paused) {
    return block('account_paused', `安全閘門:${label} 已開啟帳號停止開關,暫停對外發文與回覆`);
  }

  const budget = account?.daily_action_budget ?? policy.dailyActionBudget;
  try {
    const used = await countTodayActions(env, params.accountId);
    if (used >= budget) {
      return block('budget', `安全閘門:${label} 今日對外操作已達預算 ${budget} 次(已用 ${used}),明天 00:00 重置`);
    }
  } catch (e) {
    console.warn('[social-safety] 計算今日操作數失敗', e instanceof Error ? e.message : e);
  }

  if (params.action === 'reply' && params.targetUsername && policy.authorCooldownSeconds > 0) {
    try {
      const rows = await sql`
        SELECT max(replied_at) AS last_at FROM threads_reply_targets
        WHERE brand_id = ${params.brandId}::uuid AND status = 'replied'
          AND lower(target_username) = lower(${params.targetUsername})
          AND replied_at > now() - make_interval(secs => ${policy.authorCooldownSeconds}::double precision)
      ` as { last_at: string | null }[];
      const lastAt = rows[0]?.last_at;
      if (lastAt) {
        const hours = Math.max(1, Math.round(policy.authorCooldownSeconds / 3600));
        return block('cooldown', `安全閘門:@${params.targetUsername} 在 ${hours} 小時冷卻內已回覆過(${String(lastAt).slice(0, 16).replace('T', ' ')}),先不重複打擾`);
      }
    } catch (e) {
      console.warn('[social-safety] 檢查作者冷卻失敗', e instanceof Error ? e.message : e);
    }
  }

  if (policy.duplicateWindowHours > 0) {
    try {
      const rows = await sql`
        SELECT created_at FROM social_api_requests
        WHERE account_id = ${params.accountId}::uuid AND text_hash = ${textHash}
          AND http_status BETWEEN 200 AND 299
          AND created_at > now() - make_interval(hours => ${policy.duplicateWindowHours}::int)
        ORDER BY created_at DESC LIMIT 1
      ` as { created_at: string }[];
      if (rows.length) {
        return block('duplicate', `安全閘門:${label} 在 ${policy.duplicateWindowHours} 小時內已發過相同內容(${String(rows[0].created_at).slice(0, 16).replace('T', ' ')}),避免被判定洗版`);
      }
    } catch (e) {
      console.warn('[social-safety] 檢查重複內容失敗', e instanceof Error ? e.message : e);
    }
  }

  return { ok: true, textHash };
}

/** 檢查不通過就丟 ThreadsSafetyBlockedError;通過回傳 textHash 給 threadsFetch 記帳 */
export async function assertThreadsSafety(env: Env, params: SafetyCheckParams): Promise<string> {
  const result = await checkThreadsSafety(env, params);
  if (!result.ok) throw new ThreadsSafetyBlockedError(result.code, result.reason);
  return result.textHash;
}
