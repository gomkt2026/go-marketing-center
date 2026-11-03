-- ============================================================================
-- Migration 074: 和居對談跟三小編熱聊分開，並指定小盒的聲音
--   podcast_episodes.show_slug：trio = 三小編熱聊，bbbox = 和居對談
--   guest_host_slug：和居這一集請到的小編（taskgo / homigo / washgo）
--   小盒 voiceId 固定為 ElevenLabs 9lHjugDhwqoxA5MhX0az
-- ----------------------------------------------------------------------------
-- 可安全重複執行。
-- ============================================================================

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS show_slug TEXT NOT NULL DEFAULT 'trio';

ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS guest_host_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_show
  ON podcast_episodes(show_slug, created_at DESC);

UPDATE ai_agents a
SET persona = a.persona || jsonb_build_object('voiceId', '9lHjugDhwqoxA5MhX0az')
FROM brands b
WHERE a.brand_id = b.id
  AND b.slug = 'bbbox'
  AND a.role_id = (SELECT id FROM agent_roles WHERE code = 'brand_ai');
