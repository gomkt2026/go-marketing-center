-- 品牌人脈資料庫:活動報名 + LINE 名片 OCR + 群組廠商媒合
-- 可重複執行

CREATE TABLE IF NOT EXISTS network_contacts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id           UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  name_en            TEXT,
  company            TEXT,
  title              TEXT,
  phone              TEXT,
  phone_digits       TEXT,
  email              TEXT,
  line_id            TEXT,
  line_user_id       TEXT,
  website            TEXT,
  address            TEXT,
  industry           TEXT,
  specialties        JSONB NOT NULL DEFAULT '[]',
  service_regions    JSONB NOT NULL DEFAULT '[]',
  years_experience   INTEGER,
  accepts_dispatch   BOOLEAN,
  chambers           TEXT,
  notes              TEXT,
  raw_ocr            TEXT,
  card_image_url     TEXT,
  source             TEXT NOT NULL DEFAULT 'manual',
  source_ref         TEXT,
  event_id           UUID REFERENCES events(id) ON DELETE SET NULL,
  registration_id    UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
  status             TEXT NOT NULL DEFAULT 'pending_review',
  confidence         NUMERIC(4,3),
  extra              JSONB NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT network_contacts_source_check
    CHECK (source IN ('event', 'business_card', 'line_chat', 'manual', 'csv')),
  CONSTRAINT network_contacts_status_check
    CHECK (status IN ('pending_review', 'verified', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_network_contacts_brand
  ON network_contacts(brand_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_contacts_phone
  ON network_contacts(brand_id, phone_digits)
  WHERE phone_digits IS NOT NULL AND phone_digits <> '';
CREATE INDEX IF NOT EXISTS idx_network_contacts_email
  ON network_contacts(brand_id, lower(email))
  WHERE email IS NOT NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_network_contacts_source
  ON network_contacts(brand_id, source);

DROP TRIGGER IF EXISTS trg_network_contacts_updated_at ON network_contacts;
CREATE TRIGGER trg_network_contacts_updated_at BEFORE UPDATE ON network_contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS line_network_inbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id        UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  line_user_id    TEXT,
  line_group_id   TEXT,
  event_type      TEXT NOT NULL,
  message_type    TEXT,
  text            TEXT,
  contact_id      UUID REFERENCES network_contacts(id) ON DELETE SET NULL,
  handled         BOOLEAN NOT NULL DEFAULT false,
  raw             JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_line_network_inbox_brand
  ON line_network_inbox(brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS network_match_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  query_text           TEXT NOT NULL,
  category             TEXT,
  region               TEXT,
  intent               TEXT,
  matched_contact_ids  JSONB NOT NULL DEFAULT '[]',
  line_user_id         TEXT,
  line_group_id        TEXT,
  feedback             TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_match_logs_brand
  ON network_match_logs(brand_id, created_at DESC);
