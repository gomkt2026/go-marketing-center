-- 負責人在辦公室留給小編的建議。晨會只能把它當方向，不能當成已發生的新聞或數字。

CREATE TABLE IF NOT EXISTS office_suggestions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_suggestions_agent
  ON office_suggestions (agent_id, created_at DESC);
