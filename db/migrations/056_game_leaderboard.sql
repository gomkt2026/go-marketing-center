-- 匠城出任務：賽季、局、玩家、成績、得獎者
CREATE TABLE IF NOT EXISTS game_seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  prize TEXT NOT NULL DEFAULT '',
  top_n INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname TEXT NOT NULL,
  phone_hash TEXT NOT NULL UNIQUE,
  phone_enc TEXT NOT NULL,
  phone_masked TEXT NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_hash TEXT,
  submitted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS game_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL UNIQUE REFERENCES game_runs(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  season_id UUID REFERENCES game_seasons(id) ON DELETE SET NULL,
  score INTEGER NOT NULL,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_scores_season_score ON game_scores (season_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_player ON game_scores (player_id);
CREATE INDEX IF NOT EXISTS idx_game_runs_started ON game_runs (started_at);

CREATE TABLE IF NOT EXISTS game_winners (
  season_id UUID NOT NULL REFERENCES game_seasons(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES game_players(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (season_id, player_id)
);
