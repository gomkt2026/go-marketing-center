import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { requireAuth } from '../../_shared/auth';
import { getSql } from '../../_shared/db';
import { rowsToCamel } from '../../_shared/case';
import { json, error } from '../../_shared/response';
import { planSegments, type ScriptLine } from '../../_shared/podcast';

// GET /api/podcast/:id:單集詳情(腳本 + 逐段音檔 + 小編資訊 + 合成進度)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const episodeId = context.params.id as string;
  const sql = getSql(context.env);

  const epRows = await sql`
    SELECT * FROM podcast_episodes WHERE id = ${episodeId}::uuid LIMIT 1
  `;
  if (!epRows.length) return error('找不到這集節目', 404);
  const episode = rowsToCamel(epRows as Record<string, unknown>[])[0] as Record<string, unknown>;

  const [segRows, agentRows] = await Promise.all([
    sql`
      SELECT id, segment_order, label, lines, audio_url, char_count, created_at
      FROM podcast_segments
      WHERE episode_id = ${episodeId}::uuid
      ORDER BY segment_order
    `,
    sql`
      SELECT a.id, a.display_name, a.avatar_color,
             a.persona->>'nickname' AS nickname,
             a.persona->>'avatarUrl' AS avatar_url,
             a.persona->>'characterTitle' AS character_title,
             b.slug AS brand_slug, b.name AS brand_name
      FROM ai_agents a
      JOIN agent_roles r ON r.id = a.role_id
      JOIN brands b ON b.id = a.brand_id
      WHERE r.code = 'brand_ai' AND a.is_active = true
    `,
  ]);

  // 合成進度:規劃出的總段數 vs 已完成段數
  const script = (episode.script ?? []) as ScriptLine[];
  const totalChunks = script.length ? planSegments(script).length : 0;
  const readyChunks = (segRows as { audio_url: string | null }[]).filter((s) => s.audio_url).length;

  return json({
    episode,
    segments: rowsToCamel(segRows as Record<string, unknown>[]),
    agents: rowsToCamel(agentRows as Record<string, unknown>[]),
    progress: { total: totalChunks, completed: readyChunks },
  });
};
