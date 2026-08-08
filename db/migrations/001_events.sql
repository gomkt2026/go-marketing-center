-- ============================================================================
-- Migration 001: 活動報名與報到模組(events / event_sessions / event_referrers /
-- event_registrations)
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent):ENUM 用 DO block 捕捉 duplicate_object,
-- 表用 IF NOT EXISTS,索引用 IF NOT EXISTS,trigger 用 DROP IF EXISTS 再建立。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/001_events.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('draft', 'open', 'closed', 'completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_registration_status AS ENUM ('registered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_registration_source AS ENUM ('web', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_referrer_commission_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- events(實體活動:報名/報到,與 campaigns 行銷檔期不同語意,可選掛勾)
-- ============================================================================
CREATE TABLE IF NOT EXISTS events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id         UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  slug                CITEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  description         TEXT,
  location            TEXT,
  event_date          TIMESTAMPTZ,
  status              event_status NOT NULL DEFAULT 'draft',
  staff_token         VARCHAR(64) NOT NULL,
  form_fields         JSONB NOT NULL DEFAULT '[]',   -- [{key,label,type,required,options?}]
  price               NUMERIC(10,2),                 -- 拆帳計算用單價
  price_label         TEXT,                          -- 顯示用文案,如 "NT$499(原價699)"
  line_add_friend_url TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_brand ON events(brand_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_staff_token ON events(staff_token);

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- event_sessions(場次:上午/下午,可設名額上限)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  starts_at   TIMESTAMPTZ,
  capacity    INTEGER,                                -- NULL = 不限
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_sessions_event ON event_sessions(event_id);

-- ============================================================================
-- event_referrers(推薦人名單,每活動自訂,含拆帳規則)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_referrers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  commission_type   event_referrer_commission_type NOT NULL DEFAULT 'percentage',
  commission_value  NUMERIC(10,2) NOT NULL DEFAULT 0,  -- percentage: 0-100; fixed: 每人金額
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_referrers_event ON event_referrers(event_id);

DROP TRIGGER IF EXISTS trg_event_referrers_updated_at ON event_referrers;
CREATE TRIGGER trg_event_referrers_updated_at BEFORE UPDATE ON event_referrers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- event_registrations(報名/票券/報到狀態三合一,對齊 ENG 專案設計)
-- ============================================================================
CREATE TABLE IF NOT EXISTS event_registrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES event_sessions(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT,
  line_id         TEXT,
  referrer_id     UUID REFERENCES event_referrers(id) ON DELETE SET NULL,
  referrer_name   TEXT,                                 -- 名單外自行填寫
  custom_answers  JSONB NOT NULL DEFAULT '{}',
  qr_token        VARCHAR(64) NOT NULL UNIQUE,
  status          event_registration_status NOT NULL DEFAULT 'registered',
  source          event_registration_source NOT NULL DEFAULT 'web',
  checked_in_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_phone ON event_registrations(event_id, phone);
CREATE INDEX IF NOT EXISTS idx_event_registrations_qr ON event_registrations(qr_token);
CREATE INDEX IF NOT EXISTS idx_event_registrations_referrer ON event_registrations(referrer_id);

DROP TRIGGER IF EXISTS trg_event_registrations_updated_at ON event_registrations;
CREATE TRIGGER trg_event_registrations_updated_at BEFORE UPDATE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
