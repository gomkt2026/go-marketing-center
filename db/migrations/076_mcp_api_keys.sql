-- ============================================================================
-- Migration 076: Go Marketing MCP 連接器金鑰
--   外部 Claude / Grok 用 x-api-key 呼叫 /mcp。明文只在建立當下回給畫面。
-- ----------------------------------------------------------------------------
-- 可安全重複執行。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/076_mcp_api_keys.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS mcp_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_api_keys_user
  ON mcp_api_keys (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_tool_calls (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id     UUID NOT NULL REFERENCES mcp_api_keys(id) ON DELETE CASCADE,
  tool_name  TEXT NOT NULL,
  brand_slug TEXT,
  ok         BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_key_time
  ON mcp_tool_calls (key_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mcp_upload_tokens (
  token_hash TEXT PRIMARY KEY,
  key_id     UUID NOT NULL REFERENCES mcp_api_keys(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  caption    TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
