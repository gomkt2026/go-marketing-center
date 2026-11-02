import type { Env } from './env';
import { getSql } from './db';
import {
  OFFICE_CAST,
  type OfficeCastKey,
  type OfficePlan,
  factProblem,
  isOfficeQuietHour,
  officeInstruction,
} from './office-facts';

export interface OfficePack {
  active: boolean;
  theme: string;
  line: string;
  facts: string[];
  cannotClaims: string[];
}

const INACTIVE: OfficePack = { active: false, theme: '', line: '', facts: [], cannotClaims: [] };

export async function loadOfficePack(env: Env, brandId: string, slug: string): Promise<OfficePack> {
  try {
    const sql = getSql(env);
    const [settings, standups, rules] = await Promise.all([
      sql`SELECT auto_publish FROM office_settings WHERE id = 1`,
      sql`
        SELECT directive FROM office_standups
        WHERE status = 'completed' AND apply_to_generation = true AND valid_until > now()
        ORDER BY started_at DESC
        LIMIT 1
      `,
      sql`
        SELECT statement FROM brand_rules
        WHERE brand_id = ${brandId}::uuid AND rule_type IN ('cannot_claim', 'negative_rule')
        ORDER BY sort_order
        LIMIT 12
      `,
    ]);
    const setting = settings[0] as { auto_publish?: boolean } | undefined;
    if (setting && setting.auto_publish === false) return INACTIVE;
    const directive = (standups[0] as { directive?: OfficePlan } | undefined)?.directive;
    if (!directive?.brands?.length) return INACTIVE;
    const brand = directive.brands.find((item) => item.slug === slug);
    if (!brand?.theme) return INACTIVE;
    const cannotClaims = (rules as { statement: string }[]).map((row) => row.statement).filter(Boolean);
    return {
      active: true,
      theme: brand.theme,
      line: officeInstruction(directive, slug),
      facts: brand.facts ?? [],
      cannotClaims,
    };
  } catch (e) {
    console.error('[office] 讀方向失敗', e);
    return INACTIVE;
  }
}

export async function latestPodcastHint(env: Env): Promise<string | null> {
  try {
    const sql = getSql(env);
    const rows = await sql`
      SELECT directive->>'podcastTopic' AS topic
      FROM office_standups
      WHERE status = 'completed' AND started_at > now() - interval '7 days'
      ORDER BY started_at DESC
      LIMIT 1
    `;
    const topic = (rows[0] as { topic?: string } | undefined)?.topic?.trim();
    return topic || null;
  } catch (e) {
    console.error('[office] 讀 Podcast 題失敗', e);
    return null;
  }
}

export async function setOfficeActivity(
  env: Env,
  key: OfficeCastKey,
  status: 'working' | 'done' | 'blocked',
  task: string,
  artifact?: { type: string; id: string } | null,
): Promise<void> {
  const cast = OFFICE_CAST.find((item) => item.key === key);
  if (!cast) return;
  try {
    const sql = getSql(env);
    const slug = cast.slug;
    await sql`
      INSERT INTO agent_activity (agent_id, status, task_label, artifact_type, artifact_id, updated_at)
      SELECT a.id, ${status}, ${task.slice(0, 160)}, ${artifact?.type ?? null}, ${artifact?.id ?? null}, now()
      FROM ai_agents a
      JOIN agent_roles r ON r.id = a.role_id
      LEFT JOIN brands b ON b.id = a.brand_id
      WHERE r.code = ${cast.role}
        AND (
          (${slug}::text IS NULL AND a.brand_id IS NULL)
          OR b.slug = ${slug}
        )
      LIMIT 1
      ON CONFLICT (agent_id) DO UPDATE SET
        status = EXCLUDED.status,
        task_label = EXCLUDED.task_label,
        artifact_type = EXCLUDED.artifact_type,
        artifact_id = EXCLUDED.artifact_id,
        updated_at = now()
    `;
  } catch (e) {
    console.error('[office] 更新名牌失敗', e);
  }
}

export async function notePublisherBlocked(env: Env, task: string): Promise<void> {
  await setOfficeActivity(env, 'publisher', 'blocked', task);
}

export async function finishOfficeDraft(
  env: Env,
  args: {
    brandId: string;
    brandSlug: string;
    contentId: string;
    versionId: string;
    platform: string;
    slotAt?: string | null;
    active: boolean;
    blocked: string | null;
    theme: string;
    imageUrl?: string | null;
  },
): Promise<'scheduled' | 'rejected' | 'held' | 'left'> {
  if (!args.active) return 'left';
  const sql = getSql(env);
  const key = (['taskgo', 'homigo', 'washgo'] as const).find((slug) => slug === args.brandSlug);
  if (args.blocked) {
    await sql`
      UPDATE contents
      SET status = 'rejected',
          generation_prompt_meta = coalesce(generation_prompt_meta, '{}'::jsonb) || ${JSON.stringify({
            officeTheme: args.theme,
            officeBlocked: args.blocked,
          })}::jsonb,
          updated_at = now()
      WHERE id = ${args.contentId}::uuid
    `;
    await notePublisherBlocked(env, `${args.brandSlug} 這一則作廢：${args.blocked}`);
    if (key) await setOfficeActivity(env, key, 'done', `這一則作廢：${args.blocked}`, { type: 'content', id: args.contentId });
    return 'rejected';
  }
  if (args.platform === 'instagram' && !args.imageUrl) {
    await setOfficeActivity(env, 'image', 'blocked', `${args.brandSlug} 這則 IG 還沒有圖，先不排`);
    return 'held';
  }
  await sql`
    UPDATE contents
    SET status = 'scheduled',
        generation_prompt_meta = coalesce(generation_prompt_meta, '{}'::jsonb) || ${JSON.stringify({
          officeTheme: args.theme,
        })}::jsonb,
        updated_at = now()
    WHERE id = ${args.contentId}::uuid
  `;
  const when = args.slotAt ?? new Date().toISOString();
  await sql`
    INSERT INTO publishing_jobs (content_id, content_version_id, platform, status, scheduled_at)
    SELECT ${args.contentId}::uuid, ${args.versionId}::uuid, ${args.platform}, 'scheduled', ${when}::timestamptz
    WHERE NOT EXISTS (
      SELECT 1 FROM publishing_jobs
      WHERE content_id = ${args.contentId}::uuid AND status IN ('scheduled', 'publishing', 'published')
    )
  `;
  await setOfficeActivity(env, 'publisher', 'done', `已排 ${args.brandSlug} 的 ${args.platform}`, { type: 'content', id: args.contentId });
  if (key) await setOfficeActivity(env, key, 'done', `這一則已排：${args.theme}`, { type: 'content', id: args.contentId });
  if (args.imageUrl) {
    await setOfficeActivity(env, 'image', 'done', `這張跟 ${args.brandSlug} 的「${args.theme}」一起出`, { type: 'content', id: args.contentId });
  }
  return 'scheduled';
}

export function copyProblem(body: string, pack: OfficePack): string | null {
  if (!pack.active) return null;
  return factProblem(body, pack.cannotClaims, pack.facts);
}

export async function setOfficeAutoPublish(env: Env, autoPublish: boolean, at = new Date()): Promise<void> {
  const sql = getSql(env);
  await sql`UPDATE office_settings SET auto_publish = ${autoPublish}, updated_at = now() WHERE id = 1`;
  if (!autoPublish) {
    await sql`
      UPDATE office_standups
      SET apply_to_generation = false
      WHERE apply_to_generation = true AND valid_until > now()
    `;
    await notePublisherBlocked(env, '總開關關著，這班不發出去');
    return;
  }
  if (isOfficeQuietHour(at)) {
    await setOfficeActivity(env, 'publisher', 'done', '方向先記下，早上八點才發');
    return;
  }
  await sql`
    UPDATE office_standups
    SET apply_to_generation = true
    WHERE id = (
      SELECT id FROM office_standups
      WHERE status = 'completed' AND valid_until > now()
      ORDER BY started_at DESC
      LIMIT 1
    )
  `;
  await setOfficeActivity(env, 'publisher', 'done', '通過檢查的稿直接排進發布');
}
