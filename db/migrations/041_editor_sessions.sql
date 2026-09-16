-- ============================================================================
-- Migration 041: 品牌小編 1:1 工作台對話
--   管理者 ↔ 單一品牌小編(阿樂／小咪／阿豪),不走 meetings 語意。
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- ============================================================================

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
);
CREATE INDEX IF NOT EXISTS idx_editor_sessions_brand
  ON editor_sessions(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_editor_sessions_user
  ON editor_sessions(user_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_editor_sessions_updated_at ON editor_sessions;
CREATE TRIGGER trg_editor_sessions_updated_at BEFORE UPDATE ON editor_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS editor_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES editor_sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  content       TEXT NOT NULL,
  tool_name     TEXT,
  tool_payload  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_editor_messages_session
  ON editor_messages(session_id, created_at);

DO $$ BEGIN
  ALTER TABLE editor_sessions
    ADD CONSTRAINT editor_sessions_status_check
    CHECK (status IN ('active', 'ended'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE editor_messages
    ADD CONSTRAINT editor_messages_role_check
    CHECK (role IN ('user', 'assistant', 'tool'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
