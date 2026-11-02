import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { json, failLoad } from '../../_shared/response';
import { ensureOfficeSuggestions, setOfficeAutoPublish } from '../../_shared/office-directive';
import { ensureOfficeFilmColumns } from '../../_shared/office-film';
import { OFFICE_MONTHLY_BUDGET_USD, isOfficeQuietHour } from '../../_shared/office-facts';
import { fetchGoogleTrendsTW, fetchTaiwanNews } from '../../_shared/sources';
import { extractKeywords } from '../trending';

function hotKeywords(trends: { title: string }[], news: { title: string }[], signals: string[]) {
  const mined = extractKeywords(
    [...trends.map((item) => item.title), ...news.map((item) => item.title), ...signals],
    12,
  ).map((item) => item.text);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...trends.map((item) => item.title), ...mined]) {
    const text = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
    const key = text.toLowerCase();
    if (text.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 12) break;
  }
  return out;
}

function num(value: unknown) {
  return Number(value ?? 0);
}

function packStats(rows: Record<string, unknown>[]) {
  const pack = (row: Record<string, unknown>, period: '1' | '7' | '28') => ({
    slug: String(row.slug),
    posts: num(row[`posts_${period}`]),
    views: num(row[`views_${period}`]),
    reach: num(row[`reach_${period}`]),
    interactions: num(row[`interactions_${period}`]),
  });
  const bySlug = new Map(rows.map((row) => [String(row.slug), row]));
  const empty = (slug: string) => ({ slug, posts_1: 0, posts_7: 0, posts_28: 0, views_1: 0, views_7: 0, views_28: 0, reach_1: 0, reach_7: 0, reach_28: 0, interactions_1: 0, interactions_7: 0, interactions_28: 0 });
  return {
    '1': ['taskgo', 'homigo', 'washgo'].map((slug) => pack(bySlug.get(slug) ?? empty(slug), '1')),
    '7': ['taskgo', 'homigo', 'washgo'].map((slug) => pack(bySlug.get(slug) ?? empty(slug), '7')),
    '28': ['taskgo', 'homigo', 'washgo'].map((slug) => pack(bySlug.get(slug) ?? empty(slug), '28')),
  };
}

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
    await ensureOfficeSuggestions(context.env).catch(() => undefined);
    const filmReady = await ensureOfficeFilmColumns(context.env).then(() => true).catch(() => false);
    const standupQuery = filmReady
      ? sql`
          SELECT id, started_at, status, directive, bubbles, cost_usd, apply_to_generation, valid_until, note, film_url, film_status
          FROM office_standups
          ORDER BY started_at DESC
          LIMIT 1
        `
      : sql`
          SELECT id, started_at, status, directive, bubbles, cost_usd, apply_to_generation, valid_until, note
          FROM office_standups
          ORDER BY started_at DESC
          LIMIT 1
        `;
    const hotWords = Promise.race([
      Promise.all([fetchGoogleTrendsTW(12), fetchTaiwanNews(8)]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('hot-timeout')), 2500)),
    ]).catch(() => [[], []] as [{ title: string }[], { title: string }[]]);
    const [settings, standups, agents, signals, podcasts, videos, spentRows, findings, statRows, nextRows, suggestionRows, hot] = await Promise.all([
      sql`SELECT auto_publish FROM office_settings WHERE id = 1`,
      standupQuery,
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
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '1 day')::int AS posts_1,
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '7 days')::int AS posts_7,
          count(pj.id) FILTER (WHERE pj.published_at >= now() - interval '28 days')::int AS posts_28,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '1 day'), 0)::bigint AS views_1,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '7 days'), 0)::bigint AS views_7,
          coalesce(sum(pr.impressions) FILTER (WHERE pj.published_at >= now() - interval '28 days'), 0)::bigint AS views_28,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '1 day' AND coalesce(pr.raw_metrics->>'reach', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'reach')::bigint ELSE 0 END), 0)::bigint AS reach_1,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '7 days' AND coalesce(pr.raw_metrics->>'reach', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'reach')::bigint ELSE 0 END), 0)::bigint AS reach_7,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '28 days' AND coalesce(pr.raw_metrics->>'reach', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'reach')::bigint ELSE 0 END), 0)::bigint AS reach_28,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '1 day' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::bigint AS interactions_1,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '7 days' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::bigint AS interactions_7,
          coalesce(sum(CASE WHEN pj.published_at >= now() - interval '28 days' THEN coalesce(pr.comments, 0) + coalesce(pr.shares, 0) + coalesce(pr.saves, 0) + CASE WHEN coalesce(pr.raw_metrics->>'likes', '') ~ '^[0-9]+$' THEN (pr.raw_metrics->>'likes')::bigint ELSE 0 END ELSE 0 END), 0)::bigint AS interactions_28
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
        SELECT DISTINCT ON (b.slug)
          b.slug, coalesce(c.title, '未命名') AS title, pj.platform::text AS platform, pj.scheduled_at
        FROM publishing_jobs pj
        JOIN contents c ON c.id = pj.content_id
        JOIN brands b ON b.id = c.brand_id
        WHERE pj.status IN ('queued', 'scheduled', 'publishing')
          AND b.slug IN ('taskgo', 'homigo', 'washgo')
        ORDER BY b.slug, pj.scheduled_at ASC NULLS LAST
      `,
      sql`
        SELECT s.id, s.agent_id, s.body, s.created_at
        FROM office_suggestions s
        ORDER BY s.created_at DESC
        LIMIT 20
      `.catch(() => []),
      hotWords,
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
      brandStats: packStats(statRows as Record<string, unknown>[]),
      nextJobs: ['taskgo', 'homigo', 'washgo'].map((slug) => {
        const row = (nextRows as { slug: string; title: string; platform: string; scheduled_at: string | null }[])
          .find((item) => item.slug === slug);
        return {
          slug,
          title: row?.title ?? null,
          platform: row?.platform ?? null,
          scheduledAt: row?.scheduled_at ?? null,
        };
      }),
      keywords: hotKeywords(
        hot[0] ?? [],
        hot[1] ?? [],
        (signals as { title: string }[]).map((item) => item.title),
      ),
      suggestions: (suggestionRows as { id: string; agent_id: string; body: string; created_at: string }[]).map((row) => ({
        id: row.id,
        agentId: row.agent_id,
        body: row.body,
        createdAt: row.created_at,
      })),
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
    const body = await context.request.json().catch(() => ({})) as { autoPublish?: boolean; suggestion?: string; agentId?: string };
    if (typeof body.suggestion === 'string') {
      const text = body.suggestion.trim().slice(0, 400);
      if (text.length < 2 || !body.agentId) return json({ error: '請寫下要交給這位小編的建議' }, 400);
      await ensureOfficeSuggestions(context.env);
      const sql = getSql(context.env);
      const found = await sql`
        SELECT a.id
        FROM ai_agents a
        JOIN agent_roles r ON r.id = a.role_id
        WHERE a.id = ${body.agentId}::uuid
          AND a.is_active = true
          AND r.code IN ('brand_ai', 'market_analyst', 'content_strategist', 'publisher', 'podcast_producer', 'art_director', 'video_editor')
      `;
      if (!found.length) return json({ error: '找不到這位小編' }, 404);
      await sql`
        INSERT INTO office_suggestions (agent_id, user_id, body)
        VALUES (${body.agentId}::uuid, ${auth.userId}::uuid, ${text})
      `;
      return json({ ok: true });
    }
    if (typeof body.autoPublish !== 'boolean') return json({ error: '需要 autoPublish' }, 400);
    await setOfficeAutoPublish(context.env, body.autoPublish);
    return json({ ok: true, autoPublish: body.autoPublish });
  } catch (e) {
    return failLoad('行銷中心開關', e);
  }
};
