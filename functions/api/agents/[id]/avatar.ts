import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../../_shared/env';
import { requireAuth } from '../../../_shared/auth';
import { getSql } from '../../../_shared/db';
import { json, error } from '../../../_shared/response';
import { generateImage } from '../../../_shared/openai';
import { putMedia } from '../../../_shared/media';

// 為 Agent 生成可愛人偶頭像,存 R2 並寫回 persona.avatarUrl
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const auth = await requireAuth(context.request, context.env);
  if (auth instanceof Response) return auth;

  const agentId = context.params.id as string;
  const sql = getSql(context.env);
  const rows = await sql`
    SELECT a.id, a.display_name, a.persona, b.slug AS brand_slug
    FROM ai_agents a
    LEFT JOIN brands b ON b.id = a.brand_id
    WHERE a.id = ${agentId}::uuid LIMIT 1
  `;
  if (!rows.length) return error('找不到 Agent', 404);
  const agent = rows[0] as { id: string; display_name: string; persona: Record<string, unknown> | null; brand_slug: string | null };
  const persona = (agent.persona ?? {}) as Record<string, unknown>;

  const title = (persona.characterTitle as string) ?? '社群小編';
  const temperament = (persona.temperament as string) ?? '';

  const prompt = [
    `Cute chibi 3D mascot character figurine of a Taiwanese ${title === '工班師傅' ? 'construction worker foreman with a yellow hard hat and tool belt' : title === '包租管家' ? 'friendly female property manager holding a clipboard and house keys' : title === '洗衣店店員' ? 'cheerful laundry shop clerk holding a laundry basket with folded clothes' : title}`,
    'big head small body, kawaii toy style, soft studio lighting, pastel colored simple background,',
    'friendly smiling expression, high quality render, centered portrait, no text.',
    temperament ? `Personality vibe: ${temperament.slice(0, 100)}` : '',
  ].filter(Boolean).join(' ');

  try {
    const bytes = await generateImage(context.env, { prompt, size: '1024x1024' });
    // 頭像走 avatars/ 前綴,不在排程的 generated/ 清理範圍內,不會被 31 天清掉
    const key = `avatars/${agent.brand_slug ?? 'shared'}/${crypto.randomUUID()}.png`;
    const avatarUrl = await putMedia(context.env, key, bytes);

    const newPersona = { ...persona, avatarUrl };
    await sql`
      UPDATE ai_agents SET persona = ${JSON.stringify(newPersona)}, updated_at = now()
      WHERE id = ${agentId}::uuid
    `;
    return json({ avatarUrl });
  } catch (e) {
    return error(`頭像生成失敗:${e instanceof Error ? e.message : '未知錯誤'}`, 502);
  }
};
