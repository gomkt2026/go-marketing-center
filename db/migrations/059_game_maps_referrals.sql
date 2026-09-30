-- 匠城出任務 v7：小／中／大／台灣地圖分開排名、賽季獎品地圖、邀請朋友解鎖台灣地圖
ALTER TABLE game_runs ADD COLUMN IF NOT EXISTS map TEXT NOT NULL DEFAULT 's';
ALTER TABLE game_scores ADD COLUMN IF NOT EXISTS map TEXT NOT NULL DEFAULT 's';
ALTER TABLE game_seasons ADD COLUMN IF NOT EXISTS prize_map TEXT NOT NULL DEFAULT 's';

CREATE INDEX IF NOT EXISTS idx_game_scores_season_map_score ON game_scores (season_id, map, score DESC);
CREATE INDEX IF NOT EXISTS idx_game_scores_map_score ON game_scores (map, score DESC);

-- 朋友從邀請連結（?ref=邀請碼）玩完一班記一筆；每位朋友只算一次
CREATE TABLE IF NOT EXISTS game_referrals (
  id BIGSERIAL PRIMARY KEY,
  ref_code TEXT NOT NULL,
  friend_pid TEXT NOT NULL UNIQUE,
  env TEXT,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_game_referrals_code ON game_referrals (ref_code);
