-- ============================================================================
-- Migration 005: 三小編熱門話題 Podcast
--   1. podcast_episodes(每集節目:選題 + LLM 逐字稿 + 狀態)
--   2. podcast_segments(逐段 TTS 音檔,存 R2,審核頁依序播放)
--   3. ai_agents.persona 補 ElevenLabs voiceId(阿豪/小咪/阿樂)
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/005_podcast.sql
-- ============================================================================

-- 狀態流轉:
--   script_draft     → 排程/手動產出逐字稿,待人工看稿
--   audio_generating → 已觸發 ElevenLabs 合成,處理中
--   ready_for_review → 音檔全部就緒,待人工試聽審核
--   approved         → 審核通過(第一階段僅內部使用,不對外發布)
--   rejected         → 打回(可重新生成)
--   archived         → 封存
DO $$ BEGIN
  CREATE TYPE podcast_episode_status AS ENUM (
    'script_draft', 'audio_generating', 'ready_for_review',
    'approved', 'rejected', 'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- podcast_episodes(一集節目)
-- ============================================================================
CREATE TABLE IF NOT EXISTS podcast_episodes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of            DATE NOT NULL,                     -- 該集所屬週(週一日期)
  episode_seq        SMALLINT NOT NULL DEFAULT 1,       -- 本週第幾集(1 或 2)
  title              TEXT,                              -- 本集標題(LLM 產生)
  topic_summary      TEXT,                              -- 本集話題摘要
  source_signal_ids  JSONB NOT NULL DEFAULT '[]',       -- 用到的 market_signals.id 清單
  -- 完整逐字稿:[{order, segmentLabel, agentId, nickname, text, emotion}]
  script             JSONB NOT NULL DEFAULT '[]',
  status             podcast_episode_status NOT NULL DEFAULT 'script_draft',
  error_message      TEXT,                              -- 合成失敗時的錯誤訊息
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_status
  ON podcast_episodes(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_episodes_week
  ON podcast_episodes(week_of DESC, episode_seq);

DROP TRIGGER IF EXISTS trg_podcast_episodes_updated_at ON podcast_episodes;
CREATE TRIGGER trg_podcast_episodes_updated_at BEFORE UPDATE ON podcast_episodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- podcast_segments(逐段音檔:開場 / 話題1 / … / 結尾,每段一支 mp3)
-- ============================================================================
CREATE TABLE IF NOT EXISTS podcast_segments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id         UUID NOT NULL REFERENCES podcast_episodes(id) ON DELETE CASCADE,
  segment_order      INT NOT NULL,                      -- 播放順序(0 起)
  label              TEXT NOT NULL,                     -- intro | topic1 | topic2 | ... | outro
  lines              JSONB NOT NULL DEFAULT '[]',       -- 這段送去 TTS 的台詞明細
  audio_url          TEXT,                              -- R2 路徑(經 /api/media/... 讀取)
  char_count         INT,                               -- 這段的中文字數(成本追蹤)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (episode_id, segment_order)
);
CREATE INDEX IF NOT EXISTS idx_podcast_segments_episode
  ON podcast_segments(episode_id, segment_order);

-- ============================================================================
-- 三位小編補 ElevenLabs voiceId(僅在尚未設定時寫入,不覆蓋既有值)
-- ============================================================================
UPDATE ai_agents a SET persona = a.persona || jsonb_build_object('voiceId', 'auoHciLZJwKTwYUoRTYz')
FROM brands b
WHERE a.brand_id = b.id AND b.slug = 'taskgo' AND (a.persona->>'voiceId') IS NULL
  AND a.role_id = (SELECT id FROM agent_roles WHERE code = 'brand_ai');

UPDATE ai_agents a SET persona = a.persona || jsonb_build_object('voiceId', '1AKkSX7KMPHIWuz76m0n')
FROM brands b
WHERE a.brand_id = b.id AND b.slug = 'homigo' AND (a.persona->>'voiceId') IS NULL
  AND a.role_id = (SELECT id FROM agent_roles WHERE code = 'brand_ai');

UPDATE ai_agents a SET persona = a.persona || jsonb_build_object('voiceId', '4aW8bNY2tSD8eaHmuXZ0')
FROM brands b
WHERE a.brand_id = b.id AND b.slug = 'washgo' AND (a.persona->>'voiceId') IS NULL
  AND a.role_id = (SELECT id FROM agent_roles WHERE code = 'brand_ai');
