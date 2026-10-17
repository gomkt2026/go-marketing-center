-- 公開頁「工班現場」下方的短片拍攝需求。電話只在登入後台後顯示。
CREATE TABLE IF NOT EXISTS crew_video_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_name     TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  line_id       TEXT,
  trade         TEXT NOT NULL,
  area          TEXT,
  focus         TEXT NOT NULL,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'new',
  staff_note    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted_at  TIMESTAMPTZ,
  filmed_at     TIMESTAMPTZ,
  portrait_consent BOOLEAN NOT NULL DEFAULT false,
  consented_at  TIMESTAMPTZ,
  alliance_intent BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT crew_video_requests_focus_check CHECK (focus IN ('intro', 'before_after', 'process', 'unsure')),
  CONSTRAINT crew_video_requests_status_check CHECK (status IN ('new', 'scheduled', 'filmed', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_crew_video_requests_created
  ON crew_video_requests (created_at DESC);
