-- ============================================================================
-- Migration 045: 品牌發文時段 + 管理者 Line 綁定
--   - brand_posting_slots 取代 scheduler 寫死的 19:00 / Threads 六檔
--   - user_line_bindings / line_bind_codes / line_review_digests 給審閱推播與成效查詢
-- 可安全重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS brand_posting_slots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform    publishing_platform NOT NULL,
  hour_tw     SMALLINT NOT NULL,
  slot_kind   TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brand_posting_slots_hour_check CHECK (hour_tw >= 0 AND hour_tw <= 23),
  CONSTRAINT brand_posting_slots_kind_check CHECK (slot_kind IN ('daily_theme', 'threads_hourly', 'threads_offtopic')),
  CONSTRAINT brand_posting_slots_platform_check CHECK (platform IN ('facebook', 'instagram', 'threads')),
  UNIQUE (brand_id, platform, hour_tw, slot_kind)
);

CREATE INDEX IF NOT EXISTS idx_brand_posting_slots_brand
  ON brand_posting_slots(brand_id, platform, enabled);

DROP TRIGGER IF EXISTS trg_brand_posting_slots_updated_at ON brand_posting_slots;
CREATE TRIGGER trg_brand_posting_slots_updated_at BEFORE UPDATE ON brand_posting_slots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO brand_posting_slots (brand_id, platform, hour_tw, slot_kind, enabled)
SELECT b.id, v.platform::publishing_platform, v.hour_tw, v.slot_kind, true
FROM brands b
CROSS JOIN (
  VALUES
    ('facebook', 19, 'daily_theme'),
    ('instagram', 19, 'daily_theme'),
    ('threads', 0, 'threads_hourly'),
    ('threads', 6, 'threads_hourly'),
    ('threads', 12, 'threads_hourly'),
    ('threads', 18, 'threads_hourly'),
    ('threads', 9, 'threads_offtopic'),
    ('threads', 21, 'threads_offtopic')
) AS v(platform, hour_tw, slot_kind)
WHERE b.slug IN ('homigo', 'taskgo', 'washgo')
ON CONFLICT (brand_id, platform, hour_tw, slot_kind) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_line_bindings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  line_user_id    TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  notify_review   BOOLEAN NOT NULL DEFAULT true,
  notify_failed   BOOLEAN NOT NULL DEFAULT true,
  bound_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_line_bindings_user ON user_line_bindings(user_id);

DROP TRIGGER IF EXISTS trg_user_line_bindings_updated_at ON user_line_bindings;
CREATE TRIGGER trg_user_line_bindings_updated_at BEFORE UPDATE ON user_line_bindings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS line_bind_codes (
  code        TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_bind_codes_user ON line_bind_codes(user_id, expires_at);

CREATE TABLE IF NOT EXISTS line_review_digests (
  brand_id           UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  pending_count      INTEGER NOT NULL DEFAULT 0,
  last_notified_at   TIMESTAMPTZ
);
