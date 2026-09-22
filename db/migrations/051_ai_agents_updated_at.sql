-- ============================================================================
-- Migration 051: ai_agents.updated_at
--   小編人設 / 頭像寫回時會 SET updated_at = now(),但建表時漏了這個欄位,
--   導致 /api/agents/:id PUT 儲存失敗。
-- ============================================================================

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_ai_agents_updated_at ON ai_agents;
CREATE TRIGGER trg_ai_agents_updated_at BEFORE UPDATE ON ai_agents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
