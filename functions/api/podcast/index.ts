import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth, isSuperAdmin } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { createPodcastEpisode } from '../../_shared/podcast';

// GET /api/podcast:節目列表(可用 ?status= 過濾)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth)) return json({ episodes: [] });

  const sql = getSql(context.env);
  const status = new URL(context.request.url).searchParams.get('status');
  const rows = status
    ? await sql`
        SELECT e.id, e.week_of, e.episode_seq, e.title, e.topic_summary, e.status, e.error_message,
               e.episode_type, e.guest_id, g.name AS guest_name,
               e.created_at, e.updated_at,
               jsonb_array_length(e.script) AS line_count,
               (SELECT count(*)::int FROM podcast_segments s WHERE s.episode_id = e.id AND s.audio_url IS NOT NULL) AS segments_ready
        FROM podcast_episodes e
        LEFT JOIN podcast_guests g ON g.id = e.guest_id
        WHERE e.status = ${status}::podcast_episode_status
        ORDER BY e.created_at DESC LIMIT 50
      `
    : await sql`
        SELECT e.id, e.week_of, e.episode_seq, e.title, e.topic_summary, e.status, e.error_message,
               e.episode_type, e.guest_id, g.name AS guest_name,
               e.created_at, e.updated_at,
               jsonb_array_length(e.script) AS line_count,
               (SELECT count(*)::int FROM podcast_segments s WHERE s.episode_id = e.id AND s.audio_url IS NOT NULL) AS segments_ready
        FROM podcast_episodes e
        LEFT JOIN podcast_guests g ON g.id = e.guest_id
        ORDER BY e.created_at DESC LIMIT 50
      `;
  return json({ episodes: rowsToCamel(rows as Record<string, unknown>[]) });
};

// POST /api/podcast:手動觸發生成新一集(選題 + 腳本,不合成語音、不燒 ElevenLabs 額度)
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;
  if (!isSuperAdmin(auth)) return error('Forbidden', 403);

  try {
    const result = await createPodcastEpisode(context.env);
    return json(result, 201);
  } catch (e) {
    return error(`生成節目失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
