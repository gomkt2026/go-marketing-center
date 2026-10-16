-- 公開頁「工班現場」留下的客戶與合作留言。電話只在登入後台後顯示，再轉給對應工班。
CREATE TABLE IF NOT EXISTS crew_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_slug     TEXT NOT NULL,
  intent        TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  line_id       TEXT,
  need          TEXT NOT NULL,
  place         TEXT,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  staff_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  handed_at     TIMESTAMPTZ,
  CONSTRAINT crew_leads_intent_check CHECK (intent IN ('customer', 'partner')),
  CONSTRAINT crew_leads_status_check CHECK (status IN ('new', 'handed', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_crew_leads_created
  ON crew_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crew_leads_crew
  ON crew_leads (crew_slug, created_at DESC);
