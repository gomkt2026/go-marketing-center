import type { Env } from './env';
import { getSql } from './db';

function isMissingUpdatedAt(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /column ["']?updated_at["']? of relation ["']?ai_agents["']? does not exist/i.test(msg);
}

export async function ensureAgentUpdatedAt(env: Env): Promise<void> {
  const sql = getSql(env);
  await sql`ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`;
}

/** 寫回 ai_agents.persona,並補齊缺失的 updated_at 欄位 */
export async function writeAgentPersona(
  env: Env,
  agentId: string,
  persona: Record<string, unknown>,
): Promise<{ id: string; display_name: string; persona: Record<string, unknown> }[]> {
  const sql = getSql(env);
  const payload = JSON.stringify(persona);
  try {
    return await sql`
      UPDATE ai_agents
      SET persona = ${payload}::jsonb, updated_at = now()
      WHERE id = ${agentId}::uuid
      RETURNING id, display_name, persona
    ` as { id: string; display_name: string; persona: Record<string, unknown> }[];
  } catch (e) {
    if (!isMissingUpdatedAt(e)) throw e;
    await ensureAgentUpdatedAt(env);
    return await sql`
      UPDATE ai_agents
      SET persona = ${payload}::jsonb, updated_at = now()
      WHERE id = ${agentId}::uuid
      RETURNING id, display_name, persona
    ` as { id: string; display_name: string; persona: Record<string, unknown> }[];
  }
}
