-- 公開頁「Go 幫你發文」需求。後台登入後才能看完整電話。
CREATE TABLE IF NOT EXISTS posting_inquiries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  line_id       TEXT,
  trade         TEXT NOT NULL,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  staff_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at  TIMESTAMPTZ,
  CONSTRAINT posting_inquiries_status_check CHECK (status IN ('new', 'contacted'))
);

CREATE INDEX IF NOT EXISTS idx_posting_inquiries_created
  ON posting_inquiries (created_at DESC);
