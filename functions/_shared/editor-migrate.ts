import type { Env } from './env';
import { getSql } from './db';

export function isMissingEditorTables(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /relation ["']?editor_sessions["']? does not exist/i.test(msg)
    || /relation ["']?editor_messages["']? does not exist/i.test(msg);
}

export async function applyEditorMigration(env: Env): Promise<string[]> {
  const sql = getSql(env);
  const steps: string[] = [];

  await sql`
    CREATE TABLE IF NOT EXISTS editor_sessions (
      id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id                    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id                    UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
      elevenlabs_conversation_id  TEXT,
      status                      TEXT NOT NULL DEFAULT 'active',
      pinned_context              JSONB NOT NULL DEFAULT '{}',
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  steps.push('table:editor_sessions');

  await sql`CREATE INDEX IF NOT EXISTS idx_editor_sessions_brand ON editor_sessions(brand_id, created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_editor_sessions_user ON editor_sessions(user_id, created_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS editor_messages (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id    UUID NOT NULL REFERENCES editor_sessions(id) ON DELETE CASCADE,
      role          TEXT NOT NULL,
      content       TEXT NOT NULL,
      tool_name     TEXT,
      tool_payload  JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  steps.push('table:editor_messages');
  await sql`CREATE INDEX IF NOT EXISTS idx_editor_messages_session ON editor_messages(session_id, created_at)`;

  return steps;
}

export async function withEditorTables<T>(env: Env, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isMissingEditorTables(e)) throw e;
    await applyEditorMigration(env);
    return run();
  }
}
