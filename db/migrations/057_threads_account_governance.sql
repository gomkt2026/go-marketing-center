-- ============================================================================
-- Migration 057: Threads 帳號連線與對外操作治理
--   1. brand_social_accounts:授權範圍、連線方式、最後刷新、主帳號、帳號停止開關與預算
--   2. 一個品牌可連多個 Threads 帳號(FB / IG / X 仍維持每品牌一個)
--   3. social_safety_policy:整個行銷中心的停止開關、每日操作預算、重複內容視窗、作者冷卻
--   4. social_api_requests:每次呼叫 Threads API 的紀錄(不存 token 與 query string)
--   5. publishing_jobs / threads_reply_targets 記錄實際使用的帳號
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/057_threads_account_governance.sql
-- ============================================================================

-- ==========================================================================
-- 1. brand_social_accounts 擴充
-- ==========================================================================
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS granted_scopes TEXT[];            -- NULL = 尚未偵測
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS scopes_checked_at TIMESTAMPTZ;
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS scopes_source TEXT;               -- debug_token | probe
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS connected_via TEXT NOT NULL DEFAULT 'manual'; -- oauth | manual
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS daily_action_budget INT;          -- NULL = 沿用組織預設

DO $$ BEGIN
  ALTER TABLE brand_social_accounts
    ADD CONSTRAINT brand_social_accounts_connected_via_check CHECK (connected_via IN ('oauth', 'manual'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE brand_social_accounts
    ADD CONSTRAINT brand_social_accounts_daily_action_budget_check
    CHECK (daily_action_budget IS NULL OR (daily_action_budget >= 0 AND daily_action_budget <= 500));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 既有每品牌唯一的一個 Threads 帳號,升為主帳號
UPDATE brand_social_accounts SET is_primary = true
WHERE platform = 'threads' AND brand_id IS NOT NULL AND is_primary = false
  AND NOT EXISTS (
    SELECT 1 FROM brand_social_accounts p
    WHERE p.brand_id = brand_social_accounts.brand_id AND p.platform = 'threads' AND p.is_primary
  );

-- ==========================================================================
-- 2. 唯一鍵:FB / IG / X 每品牌一個;Threads 每品牌可多個,但同一 Threads 使用者只能接一次
-- ==========================================================================
ALTER TABLE brand_social_accounts DROP CONSTRAINT IF EXISTS brand_social_accounts_brand_id_platform_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_accounts_brand_platform_single
  ON brand_social_accounts(brand_id, platform) WHERE platform <> 'threads';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_accounts_threads_user
  ON brand_social_accounts(brand_id, external_id) WHERE platform = 'threads';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_accounts_threads_primary
  ON brand_social_accounts(brand_id) WHERE platform = 'threads' AND is_primary;

-- ==========================================================================
-- 3. social_safety_policy(單筆,id 固定為 1)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS social_safety_policy (
  id                      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  org_paused              BOOLEAN NOT NULL DEFAULT false,
  daily_action_budget     INT NOT NULL DEFAULT 20 CHECK (daily_action_budget >= 0 AND daily_action_budget <= 500),
  duplicate_window_hours  INT NOT NULL DEFAULT 168 CHECK (duplicate_window_hours >= 0 AND duplicate_window_hours <= 2160),
  author_cooldown_seconds INT NOT NULL DEFAULT 86400 CHECK (author_cooldown_seconds >= 0 AND author_cooldown_seconds <= 2592000),
  updated_by              UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO social_safety_policy (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ==========================================================================
-- 4. social_api_requests(保留 90 天,由 scheduler cleanup 清除)
--   action:publish | reply | search | insights | refresh | probe | lookup
--   blocked_reason 有值時代表被安全閘門擋下、沒有真的打 API(http_status 為 NULL)
-- ==========================================================================
CREATE TABLE IF NOT EXISTS social_api_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID REFERENCES brand_social_accounts(id) ON DELETE CASCADE,
  brand_id       UUID REFERENCES brands(id) ON DELETE CASCADE,
  platform       TEXT NOT NULL DEFAULT 'threads',
  action         TEXT NOT NULL,
  method         TEXT NOT NULL DEFAULT 'GET',
  endpoint       TEXT,
  http_status    INT,
  error_code     INT,
  error_message  TEXT,
  duration_ms    INT,
  blocked_reason TEXT,
  text_hash      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_social_api_requests_account
  ON social_api_requests(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_api_requests_created
  ON social_api_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_social_api_requests_text_hash
  ON social_api_requests(account_id, text_hash, created_at DESC) WHERE text_hash IS NOT NULL;

-- ==========================================================================
-- 5. 記錄實際使用的帳號(NULL = 品牌主帳號)
-- ==========================================================================
ALTER TABLE publishing_jobs ADD COLUMN IF NOT EXISTS social_account_id UUID
  REFERENCES brand_social_accounts(id) ON DELETE SET NULL;
ALTER TABLE threads_reply_targets ADD COLUMN IF NOT EXISTS social_account_id UUID
  REFERENCES brand_social_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_threads_reply_targets_author_replied
  ON threads_reply_targets(brand_id, lower(target_username), replied_at DESC) WHERE status = 'replied';
