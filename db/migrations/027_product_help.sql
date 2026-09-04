-- ============================================================================
-- Migration 027: 品牌客服資料庫 + 系統問答小幫手 + 留資追蹤工單
--   與 brand_documents / Brand Knowledge 完全分離。可安全重複執行。
-- ============================================================================

CREATE TABLE IF NOT EXISTS cs_knowledge_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  file_url          TEXT,
  file_name         TEXT,
  mime_type         TEXT,
  extracted_text    TEXT,
  extract_status    TEXT NOT NULL DEFAULT 'pending',
  publish_status    TEXT NOT NULL DEFAULT 'draft',
  page_paths        JSONB NOT NULL DEFAULT '[]',
  uploaded_by       UUID REFERENCES users(id),
  published_by      UUID REFERENCES users(id),
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cs_knowledge_documents_extract_status_check
    CHECK (extract_status IN ('pending', 'ready', 'failed')),
  CONSTRAINT cs_knowledge_documents_publish_status_check
    CHECK (publish_status IN ('draft', 'published', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_cs_knowledge_documents_brand
  ON cs_knowledge_documents(brand_id, publish_status, created_at DESC);

DROP TRIGGER IF EXISTS trg_cs_knowledge_documents_updated_at ON cs_knowledge_documents;
CREATE TRIGGER trg_cs_knowledge_documents_updated_at BEFORE UPDATE ON cs_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS cs_knowledge_document_roles (
  document_id UUID NOT NULL REFERENCES cs_knowledge_documents(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  PRIMARY KEY (document_id, role)
);
CREATE INDEX IF NOT EXISTS idx_cs_knowledge_document_roles_role
  ON cs_knowledge_document_roles(role);

CREATE TABLE IF NOT EXISTS product_help_settings (
  brand_id         UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  widget_key       TEXT NOT NULL UNIQUE,
  welcome_by_role  JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_product_help_settings_updated_at ON product_help_settings;
CREATE TRIGGER trg_product_help_settings_updated_at BEFORE UPDATE ON product_help_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS product_help_origins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  origin     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, origin)
);

CREATE TABLE IF NOT EXISTS product_help_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  page_path    TEXT,
  source       TEXT NOT NULL DEFAULT 'web',
  widget_key   TEXT,
  client_hash  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_help_sessions_source_check CHECK (source IN ('web', 'liff', 'admin'))
);
CREATE INDEX IF NOT EXISTS idx_product_help_sessions_brand
  ON product_help_sessions(brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_help_sessions_client
  ON product_help_sessions(client_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS product_help_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES product_help_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  answered    BOOLEAN,
  citations   JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_help_messages_role_check CHECK (role IN ('user', 'assistant'))
);
CREATE INDEX IF NOT EXISTS idx_product_help_messages_session
  ON product_help_messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS product_help_tickets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id             UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  session_id           UUID REFERENCES product_help_sessions(id) ON DELETE SET NULL,
  role                 TEXT,
  page_path            TEXT,
  source               TEXT NOT NULL DEFAULT 'web',
  name                 TEXT NOT NULL,
  phone                TEXT NOT NULL,
  email                TEXT,
  line_id              TEXT,
  request_note         TEXT NOT NULL,
  transcript_snapshot  JSONB NOT NULL DEFAULT '[]',
  status               TEXT NOT NULL DEFAULT 'new',
  assigned_to          UUID REFERENCES users(id),
  contacted_at         TIMESTAMPTZ,
  resolved_at          TIMESTAMPTZ,
  followup_note        TEXT,
  client_hash          TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_help_tickets_status_check
    CHECK (status IN ('new', 'contacted', 'resolved', 'cancelled')),
  CONSTRAINT product_help_tickets_source_check CHECK (source IN ('web', 'liff', 'admin'))
);
CREATE INDEX IF NOT EXISTS idx_product_help_tickets_brand
  ON product_help_tickets(brand_id, status, created_at DESC);

DROP TRIGGER IF EXISTS trg_product_help_tickets_updated_at ON product_help_tickets;
CREATE TRIGGER trg_product_help_tickets_updated_at BEFORE UPDATE ON product_help_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO product_help_origins (brand_id, origin)
SELECT b.id, o.origin
FROM brands b
CROSS JOIN (VALUES
  ('https://app.taskgo.com.tw'),
  ('https://liff.line.me')
) AS o(origin)
WHERE b.slug IN ('homigo', 'taskgo', 'washgo')
ON CONFLICT (brand_id, origin) DO NOTHING;
