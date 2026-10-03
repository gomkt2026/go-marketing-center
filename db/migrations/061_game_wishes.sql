-- 匠城出任務留言板。公開頁只顯示 status = visible。
-- 近 7 天熱度直接從 game_runs 彙總，不另存快照。
CREATE TABLE IF NOT EXISTS game_wishes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nickname    TEXT NOT NULL DEFAULT '匿名師傅',
  body        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'feature',
  status      TEXT NOT NULL DEFAULT 'visible',
  supports    INTEGER NOT NULL DEFAULT 0,
  ip_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT game_wishes_kind_check CHECK (kind IN ('feature', 'bug', 'cheer')),
  CONSTRAINT game_wishes_status_check CHECK (status IN ('visible', 'hidden'))
);

CREATE INDEX IF NOT EXISTS idx_game_wishes_visible
  ON game_wishes (created_at DESC)
  WHERE status = 'visible';

CREATE TABLE IF NOT EXISTS game_wish_supports (
  wish_id     UUID NOT NULL REFERENCES game_wishes(id) ON DELETE CASCADE,
  ip_hash     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (wish_id, ip_hash)
);
