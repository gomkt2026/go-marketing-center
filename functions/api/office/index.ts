import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, failLoad } from '../../_shared/response';
import { setOfficeAutoPublish } from '../../_shared/office-directive';
import { OFFICE_MONTHLY_BUDGET_USD, isOfficeQuietHour } from '../../_shared/office-facts';

function personaOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const persona = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ['nickname', 'characterTitle', 'temperament', 'catchphrase', 'focus'] as const) {
    if (typeof persona[key] === 'string') out[key] = persona[key] as string;
  }
  return out;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  try {
    const sql = getSql(context.env);
    const [settings, standups, agents, signals, podcasts, videos, spentRows, findings, statRows, nextRows] = await Promise.all([
      sql`SELECT auto_publish FROM office_settings WHERE id = 1`,
      sql`
        SELECT id, started_at, status, directive, bubbles, cost_usd, apply_to_generation, valid_until, note
        FROM office_standups
        ORDER BY started_at DESC
        LIMIT 1
      `,
      sql`
        SELECT a.id, a.display_name, a.avatar_color, a.persona, r.code AS role_code,
               b.slug AS brand_slug,
               act.status, act.task_label, act.artifact_type, act.artifact_id, act.updated_at
        FROM ai_agents a
        JOIN agent_roles r ON r.id = a.role_id
        LEFT JOIN brands b ON b.id = a.brand_id
        LEFT JOIN agent_activity act ON act.agent_id = a.id
        WHERE a.is_active = true
          AND (
            (r.code = 'brand_ai' AND b.slug IN ('taskgo', 'homigo', 'washgo'))
            OR (
              r.code IN ('market_analyst', 'content_strategist', 'publisher', 'podcast_producer', 'art_director', 'video_editor')
              AND a.brand_id IS NULL
            )
          )
      `,
      sql`
        SELECT ms.id, ms.title, ms.summary, ms.source_url, b.slug
        FROM market_signals ms
        JOIN brands b ON b.id = ms.brand_id
        WHERE b.slug IN ('taskgo', 'homigo', 'washgo')
        ORDER BY ms.discovered_at DESC
        LIMIT 6
      `,
      sql`
        SELECT id, coalesce(title, '未命名') AS title, status::text AS status
        FROM podcast_episodes
        WHERE status IN ('script_draft', 'audio_generating', 'ready_for_review')
        ORDER BY created_at DESC
        LIMIT 5
      `,
      sql`
        SELECT id, coalesce(title, '未命名') AS title, status::text AS status, final_url, preview_url
        FROM video_jobs
        WHERE status <> 'rejected'
        ORDER BY updated_at DESC
        LIMIT 5
      `,
      sql`
        SELECT coalesce(sum(cost_usd), 0)::float AS spent
        FROM office_standups
        WHERE started_at >= date_trunc('month', timezone('Asia/Taipei', now())) AT TIME ZONE 'Asia/Taipei'
      `,
      sql`
        SELECT DISTINCT ON (f.brand_id) b.slug, f.summary, f.source_url
        FROM agent_findings f
        JOIN brands b ON b.id = f.brand_id
        ORDER BY f.brand_id, f.created_at DESC
      `,
      sql`
        SELECT b.slug,
          count(pj.id) FILTER (
            WHERE pj.status = 'published' AND pj.published_at >= now() - interval '28 days'
          )::int AS posts,
          coalesce(sum(pr.impressions) FILTER (
            WHERE pj.status = 'published' AND pj.published_at >= now() - interval '28 days'
          ), 0)::bigint AS views,
          coalesce(sum(
            CASE
              WHEN pj.status = 'published'
                AND pj.published_at >= now() - interval '28 days'
                AND coalesce(pr.raw_metrics->>'reach', '') ~ '^[0-9]+$'
              THEN (pr.raw_metrics->>'reach')::bigint
              ELSE 0
            END
          ), 0)::bigint AS reach,
          coalesce(sum(
            CASE
              WHEN pj.status = 'published' AND pj.published_at >= now() - interval '28 days'
              THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0)
                + CASE
                    WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$'
                    THEN (pr.raw_metrics->>'likes')::bigint
                    ELSE 0
                  END
              ELSE 0
            END
          ), 0)::bigint AS interactions
        FROM brands b
        LEFT JOIN contents c ON c.brand_id = b.id
        LEFT JOIN publishing_jobs pj ON pj.content_id = c.id AND pj.status = 'published'
        LEFT JOIN LATERAL (
          SELECT impressions, comments, shares, saves, raw_metrics
          FROM performance_reports
          WHERE publishing_job_id = pj.id
          ORDER BY captured_at DESC NULLS LAST
          LIMIT 1
        ) pr ON true
        WHERE b.slug IN ('taskgo', 'homigo', 'washgo')
        GROUP BY b.slug
      `,
      sql`
        SELECT b.slug, coalesce(c.title, '未命名') AS title, pj.platform::text AS platform, pj.scheduled_at
        FROM publishing_jobs pj
        JOIN contents c ON c.id = pj.content_id
        JOIN brands b ON b.id = c.brand_id
        WHERE pj.status IN ('queued', 'scheduled', 'publishing')
          AND b.slug IN ('taskgo', 'homigo', 'washgo')
        ORDER BY pj.scheduled_at ASC NULLS LAST
        LIMIT 1
      `,
    ]);

    const agentRows = agents as {
      id: string; display_name: string; avatar_color: string | null; persona: unknown; role_code: string;
      brand_slug: string | null; status: string | null; task_label: string | null;
      artifact_type: string | null; artifact_id: string | null; updated_at: string | null;
    }[];
    const contentIds = agentRows
      .filter((agent) => agent.artifact_type === 'content' && agent.artifact_id)
      .map((agent) => agent.artifact_id as string);
    const previews = contentIds.length
      ? await sql`
          SELECT c.id, c.title, c.target_platform, b.slug, left(coalesce(cv.body, ''), 220) AS body, asset.file_url
          FROM contents c
          JOIN brands b ON b.id = c.brand_id
          LEFT JOIN LATERAL (
            SELECT body FROM content_versions
            WHERE content_id = c.id
            ORDER BY version_number DESC
            LIMIT 1
          ) cv ON true
          LEFT JOIN LATERAL (
            SELECT ca.file_url
            FROM content_assets ca
            JOIN content_versions v ON v.id = ca.content_version_id
            WHERE v.content_id = c.id AND ca.asset_type = 'image'
            ORDER BY v.version_number DESC
            LIMIT 1
          ) asset ON true
          WHERE c.id = ANY(${contentIds}::uuid[])
        `
      : [];
    const previewById = new Map((previews as {
      id: string; title: string | null; target_platform: string; slug: string; body: string | null; file_url: string | null;
    }[]).map((row) => [row.id, row]));

    const setting = settings[0] as { auto_publish?: boolean } | undefined;
    return json({
      autoPublish: setting?.auto_publish !== false,
      quiet: isOfficeQuietHour(),
      budgetUsd: OFFICE_MONTHLY_BUDGET_USD,
      monthSpendUsd: Number((spentRows[0] as { spent: number } | undefined)?.spent ?? 0),
      standup: standups[0] ?? null,
      signals,
      podcasts,
      videos,
      findings,
      brandStats: (statRows as { slug: string; posts: number; views: number; reach: number; interactions: number }[]).map((row) => ({
        slug: row.slug,
        posts: Number(row.posts ?? 0),
        views: Number(row.views ?? 0),
        reach: Number(row.reach ?? 0),
        interactions: Number(row.interactions ?? 0),
      })),
      nextJob: (() => {
        const row = nextRows[0] as { slug: string; title: string; platform: string; scheduled_at: string | null } | undefined;
        if (!row) return null;
        return { slug: row.slug, title: row.title, platform: row.platform, scheduledAt: row.scheduled_at };
      })(),
      agents: agentRows.map((agent) => ({
        id: agent.id,
        roleCode: agent.role_code,
        brandSlug: agent.brand_slug,
        displayName: agent.display_name,
        color: agent.avatar_color,
        persona: personaOf(agent.persona),
        status: agent.status ?? 'done',
        task: agent.task_label ?? '等下一班晨會',
        artifactType: agent.artifact_type,
        artifactId: agent.artifact_id,
        preview: agent.artifact_id ? previewById.get(agent.artifact_id) ?? null : null,
        updatedAt: agent.updated_at,
      })),
    });
  } catch (e) {
    return failLoad('行銷中心', e);
  }
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  try {
    const body = await context.request.json().catch(() => ({})) as { autoPublish?: boolean };
    if (typeof body.autoPublish !== 'boolean') return json({ error: '需要 autoPublish' }, 400);
    await setOfficeAutoPublish(context.env, body.autoPublish);
    return json({ ok: true, autoPublish: body.autoPublish });
  } catch (e) {
    return failLoad('行銷中心開關', e);
  }
};
