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
    SELECT e.*, g.name AS guest_name
    FROM podcast_episodes e
    LEFT JOIN podcast_guests g ON g.id = e.guest_id
    WHERE e.id = ${episodeId}::uuid LIMIT 1
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

  // 訪談集:來賓也放進 agents 陣列(id 用 guest: 前綴,前端用 brandSlug='guest' 識別)
  const agents = rowsToCamel(agentRows as Record<string, unknown>[]);
  if (episode.guestId) {
    const guestRows = await sql`
      SELECT id, name, title, status FROM podcast_guests WHERE id = ${episode.guestId as string}::uuid LIMIT 1
    `;
    if (guestRows.length) {
      const g = guestRows[0] as { id: string; name: string; title: string | null };
      agents.push({
        id: `guest:${g.id}`,
        displayName: g.name,
        avatarColor: '#A0785A',
        nickname: g.name,
        avatarUrl: null,
        characterTitle: g.title ?? '特別來賓',
        brandSlug: 'guest',
        brandName: '特別來賓',
      });
    }
  }

  return json({
    episode,
    segments: rowsToCamel(segRows as Record<string, unknown>[]),
    agents,
    progress: { total: totalChunks, completed: readyChunks },
  });
};
