-- ============================================================================
-- Migration 053: LINE 工作群綁品牌 + 短影音腳本
--   - video_source_type 新增 script（先交腳本、後補實拍）
--   - line_ops_spaces 記錄機器人加入的群／房間，並可鎖單一品牌
--   - line_script_sessions 讓小編用對話交腳本
-- 可安全重複執行。
-- ============================================================================

ALTER TYPE video_source_type ADD VALUE IF NOT EXISTS 'script';

CREATE TABLE IF NOT EXISTS line_ops_spaces (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id         TEXT NOT NULL UNIQUE,
  space_type              TEXT NOT NULL,
  brand_id                UUID REFERENCES brands(id) ON DELETE SET NULL,
  display_name            TEXT,
  picture_url             TEXT,
  member_count            INTEGER,
  status                  TEXT NOT NULL DEFAULT 'active',
  bound_by_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  bound_by_line_user_id   TEXT,
  bound_at                TIMESTAMPTZ,
  joined_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at                 TIMESTAMPTZ,
  last_event_at           TIMESTAMPTZ,
  last_event_type         TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT line_ops_spaces_type_check CHECK (space_type IN ('group', 'room')),
  CONSTRAINT line_ops_spaces_status_check CHECK (status IN ('active', 'left'))
);

CREATE INDEX IF NOT EXISTS idx_line_ops_spaces_brand ON line_ops_spaces(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_line_ops_spaces_status ON line_ops_spaces(status, last_event_at DESC);

DROP TRIGGER IF EXISTS trg_line_ops_spaces_updated_at ON line_ops_spaces;
CREATE TRIGGER trg_line_ops_spaces_updated_at BEFORE UPDATE ON line_ops_spaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS line_script_sessions (
  conversation_id  TEXT NOT NULL,
  line_user_id     TEXT NOT NULL,
  step             TEXT NOT NULL,
  brand_slug       TEXT,
  title            TEXT,
  body             TEXT,
  parsed           JSONB,
  expires_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, line_user_id),
  CONSTRAINT line_script_sessions_step_check CHECK (step IN ('awaiting_script', 'awaiting_brand', 'awaiting_confirm'))
);

CREATE INDEX IF NOT EXISTS idx_line_script_sessions_exp ON line_script_sessions(expires_at);
