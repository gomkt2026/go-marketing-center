-- 匠城出任務：即時在線、遊玩時長與玩家黏著度
ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS player_id UUID REFERENCES game_players(id) ON DELETE SET NULL;
ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS last_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_game_runs_live ON game_runs (last_seen_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_game_runs_player ON game_runs (player_id) WHERE player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_game_runs_device ON game_runs (device_id) WHERE device_id IS NOT NULL;

-- 既有已上榜的局補上玩家
UPDATE game_runs r SET player_id = s.player_id
FROM game_scores s WHERE s.run_id = r.id AND r.player_id IS NULL;
