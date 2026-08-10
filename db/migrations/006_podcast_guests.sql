-- ============================================================================
-- Migration 006: Podcast 訪談來賓
--   1. podcast_guests(來賓資料:經歷/故事 + ElevenLabs cloned voice)
--   2. podcast_episodes 加 episode_type(regular/interview)與 guest_id
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/006_podcast_guests.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE podcast_guest_status AS ENUM ('pending', 'cloning', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE podcast_episode_type AS ENUM ('regular', 'interview');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- podcast_guests(訪談來賓)
-- ============================================================================
CREATE TABLE IF NOT EXISTS podcast_guests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,                      -- 來賓姓名/暱稱
  title                 TEXT,                               -- 身分/職稱(例如「二十年老師傅」)
  bio                   TEXT NOT NULL,                      -- 經歷、專業、故事(訪談腳本的素材)
  voice_sample_key      TEXT,                               -- R2 上的原始聲音樣本 key
  voice_id              TEXT,                               -- ElevenLabs cloned voice id
  consent_confirmed_at  TIMESTAMPTZ NOT NULL,               -- 勾選「已取得本人同意複製聲音」的時間
  status                podcast_guest_status NOT NULL DEFAULT 'pending',
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_podcast_guests_status ON podcast_guests(status, created_at DESC);

-- ============================================================================
-- podcast_episodes 加訪談集欄位
-- ============================================================================
ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS episode_type podcast_episode_type NOT NULL DEFAULT 'regular';
ALTER TABLE podcast_episodes
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES podcast_guests(id) ON DELETE SET NULL;
