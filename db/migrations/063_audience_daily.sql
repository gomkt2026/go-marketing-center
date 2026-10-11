-- 每天的粉絲快照。公開成果頁用 gained 畫新增粉絲。
-- 排程回收時也會 CREATE TABLE IF NOT EXISTS，這份遷移是給手動套用。

CREATE TABLE IF NOT EXISTS audience_daily (
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('facebook', 'instagram', 'threads')),
  day         DATE NOT NULL,
  followers   INT NOT NULL DEFAULT 0,
  gained      INT NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, platform, day)
);
