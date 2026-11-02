-- ============================================================================
-- Migration 069: Go 行銷中心
--   每 6 小時一次晨會方向、九位小編的現在進行式、品牌小編採集筆記。
--   不改品牌智慧正文。總開關預設開。
-- ----------------------------------------------------------------------------
-- 可安全重複執行。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/069_office_center.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS office_settings (
  id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_publish  BOOLEAN NOT NULL DEFAULT true,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO office_settings (id, auto_publish) VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS office_standups (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  status               TEXT NOT NULL,
  directive            JSONB NOT NULL DEFAULT '{}',
  bubbles              JSONB NOT NULL DEFAULT '[]',
  input_tokens         INTEGER NOT NULL DEFAULT 0,
  output_tokens        INTEGER NOT NULL DEFAULT 0,
  cost_usd             NUMERIC(12, 6) NOT NULL DEFAULT 0,
  apply_to_generation  BOOLEAN NOT NULL DEFAULT false,
  valid_until          TIMESTAMPTZ,
  note                 TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT office_standups_status_check CHECK (
    status IN ('completed', 'budget_exhausted', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_office_standups_started
  ON office_standups (started_at DESC);

CREATE TABLE IF NOT EXISTS agent_activity (
  agent_id       UUID PRIMARY KEY REFERENCES ai_agents(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  task_label     TEXT NOT NULL DEFAULT '',
  artifact_type  TEXT,
  artifact_id    TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_activity_status_check CHECK (status IN ('working', 'done', 'blocked'))
);

CREATE TABLE IF NOT EXISTS agent_findings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  agent_id    UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  standup_id  UUID REFERENCES office_standups(id) ON DELETE CASCADE,
  source_url  TEXT,
  summary     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_findings_brand
  ON agent_findings (brand_id, created_at DESC);

INSERT INTO agent_roles (code, name, description) VALUES
  ('publisher', '發文小編', '把通過檢查的稿排進現有發布'),
  ('podcast_producer', 'Podcast 小編', '提醒未上架集數，並帶晨會指定的討論題'),
  ('art_director', '圖片小編', '沿用各品牌既有畫風，呈現這一班的圖'),
  ('video_editor', '影片小編', '決定哪支成片可推；沒有素材就不假裝已剪完')
ON CONFLICT (code) DO NOTHING;

INSERT INTO ai_agents (brand_id, role_id, display_name, avatar_color, persona)
SELECT NULL, r.id, '發文小編', '#1677A8', jsonb_build_object(
  'nickname', '發文小編', 'characterTitle', '排程',
  'temperament', '準時，不把沒查過的事送出去。',
  'catchphrase', '這一檔我排了', 'focus', '三個品牌的發文時段'
)
FROM agent_roles r
WHERE r.code = 'publisher'
  AND NOT EXISTS (SELECT 1 FROM ai_agents a WHERE a.role_id = r.id AND a.brand_id IS NULL);

INSERT INTO ai_agents (brand_id, role_id, display_name, avatar_color, persona)
SELECT NULL, r.id, 'Podcast 小編', '#C4892A', jsonb_build_object(
  'nickname', 'Podcast小編', 'characterTitle', '錄音室',
  'temperament', '會提醒還沒上架的集數，也會丟一個聊得下去的題。',
  'catchphrase', '這集還在架子上', 'focus', '三小編熱聊的選題與上架'
)
FROM agent_roles r
WHERE r.code = 'podcast_producer'
  AND NOT EXISTS (SELECT 1 FROM ai_agents a WHERE a.role_id = r.id AND a.brand_id IS NULL);

INSERT INTO ai_agents (brand_id, role_id, display_name, avatar_color, persona)
SELECT NULL, r.id, '圖片小編', '#C45C86', jsonb_build_object(
  'nickname', '圖片小編', 'characterTitle', '畫桌',
  'temperament', '不換品牌畫風，圖要對得上這一則貼文。',
  'catchphrase', '這張跟這則是一起的', 'focus', '三品牌既有視覺'
)
FROM agent_roles r
WHERE r.code = 'art_director'
  AND NOT EXISTS (SELECT 1 FROM ai_agents a WHERE a.role_id = r.id AND a.brand_id IS NULL);

INSERT INTO ai_agents (brand_id, role_id, display_name, avatar_color, persona)
SELECT NULL, r.id, '影片小編', '#6B5BD0', jsonb_build_object(
  'nickname', '影片小編', 'characterTitle', '剪接台',
  'temperament', '沒有成片就直說在等素材。',
  'catchphrase', '這支先維持', 'focus', '已入庫的短片，不在這裡新剪一段錄影'
)
FROM agent_roles r
WHERE r.code = 'video_editor'
  AND NOT EXISTS (SELECT 1 FROM ai_agents a WHERE a.role_id = r.id AND a.brand_id IS NULL);

UPDATE ai_agents a
SET persona = a.persona || jsonb_build_object(
  'nickname', '新聞收集',
  'characterTitle', '情報',
  'temperament', '只報有出處的題，不添細節。',
  'catchphrase', '這則是現在在熱的',
  'focus', '熱門關鍵字與話題'
)
FROM agent_roles r
WHERE a.role_id = r.id AND r.code = 'market_analyst' AND a.brand_id IS NULL
  AND coalesce(a.persona->>'nickname', '') = '';

UPDATE ai_agents a
SET persona = a.persona || jsonb_build_object(
  'nickname', '行銷小編',
  'characterTitle', '策略',
  'temperament', '把這一班收成三個發文方向，不改品牌定位。',
  'catchphrase', '這一班就打這三題',
  'focus', '三品牌接下來六小時的方向'
)
FROM agent_roles r
WHERE a.role_id = r.id AND r.code = 'content_strategist' AND a.brand_id IS NULL
  AND coalesce(a.persona->>'nickname', '') = '';

INSERT INTO agent_activity (agent_id, status, task_label)
SELECT a.id, 'done', '等下一班晨會'
FROM ai_agents a
JOIN agent_roles r ON r.id = a.role_id
LEFT JOIN brands b ON b.id = a.brand_id
WHERE a.is_active = true
  AND (
    (r.code = 'brand_ai' AND b.slug IN ('taskgo', 'homigo', 'washgo'))
    OR (
      r.code IN ('market_analyst', 'content_strategist', 'publisher', 'podcast_producer', 'art_director', 'video_editor')
      AND a.brand_id IS NULL
    )
  )
ON CONFLICT (agent_id) DO NOTHING;
