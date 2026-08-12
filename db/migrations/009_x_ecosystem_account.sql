-- ============================================================================
-- Migration 009: Go 生態系共用 X(Twitter) 帳號 — 資料庫基礎設施
--   1. brand_social_accounts / contents 支援「collaboration 範圍」而非單一品牌
--      (比照既有 meetings / proposals 的 brand_id-or-collaboration_id 雙範圍模式)
--   2. brand_social_accounts 新增 refresh_token_enc(X OAuth2 access token 僅 2 小時效期,
--      需靠 refresh_token 續期,且 X 的 refresh_token 每次刷新會輪替,需覆寫存檔)
--   3. 新增 ecosystem_ai agent role + Go Ecosystem AI agent(brand_id = NULL,
--      只授權 read_collaboration_brief,不得存取任一品牌完整知識庫,落實 Principle 3)
--   4. 種子一筆 platform='x' 的 brand_social_accounts(collaboration 範圍,尚未連線)
-- ----------------------------------------------------------------------------
-- 依賴 008_ecosystem_collaboration.sql 先建立好 Go 生態系 Collaboration。
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/009_x_ecosystem_account.sql
-- ============================================================================

-- ==========================================================================
-- 1. contents:支援 collaboration 範圍的內容(目前只有 Go 生態系 X 帳號會用到)
--    比照 meetings/proposals 既有的 chk_*_scope 模式:brand_id 或 collaboration_id 至少一個
-- ==========================================================================
ALTER TABLE contents ADD COLUMN IF NOT EXISTS collaboration_id UUID REFERENCES collaborations(id);
ALTER TABLE contents ALTER COLUMN brand_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE contents
    ADD CONSTRAINT chk_contents_scope CHECK (brand_id IS NOT NULL OR collaboration_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_contents_collaboration ON contents(collaboration_id);

-- ==========================================================================
-- 2. brand_social_accounts:支援 collaboration 範圍的帳號(Go 生態系共用 X 帳號)
-- ==========================================================================
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS collaboration_id UUID REFERENCES collaborations(id);
ALTER TABLE brand_social_accounts ADD COLUMN IF NOT EXISTS refresh_token_enc TEXT;
ALTER TABLE brand_social_accounts ALTER COLUMN brand_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE brand_social_accounts
    ADD CONSTRAINT chk_social_account_scope CHECK (brand_id IS NOT NULL OR collaboration_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 舊有 UNIQUE(brand_id, platform) 保留不動(NULL 不受唯一性約束限制);
-- collaboration 範圍另建局部唯一索引,避免同一個 Collaboration 同平台重複建帳號
CREATE UNIQUE INDEX IF NOT EXISTS uniq_social_accounts_collab_platform
  ON brand_social_accounts(collaboration_id, platform) WHERE collaboration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brand_social_accounts_collab ON brand_social_accounts(collaboration_id);

-- ==========================================================================
-- 3. Go Ecosystem AI agent:brand_id = NULL,只授權 read_collaboration_brief
-- ==========================================================================
INSERT INTO agent_roles (code, name, description) VALUES
  ('ecosystem_ai', 'Go Ecosystem AI', '代表三品牌共用的生態系人格,僅可讀取 collaboration_briefs,不得存取任一品牌完整知識庫;用於 Go 生態系 X(Twitter) 等跨品牌帳號的內容生成')
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  role_ecosystem UUID;
  agent_ecosystem UUID;
  collab_eco      UUID;
BEGIN
  SELECT id INTO role_ecosystem FROM agent_roles WHERE code = 'ecosystem_ai' LIMIT 1;
  SELECT id INTO collab_eco FROM collaborations WHERE title = 'Go 生態系(Homigo × TaskGo × Washgo)' LIMIT 1;

  SELECT id INTO agent_ecosystem FROM ai_agents
  WHERE brand_id IS NULL AND role_id = role_ecosystem AND display_name = 'Go Ecosystem AI'
  LIMIT 1;

  IF agent_ecosystem IS NULL THEN
    agent_ecosystem := gen_random_uuid();
    INSERT INTO ai_agents (id, brand_id, role_id, display_name, avatar_color, persona) VALUES (
      agent_ecosystem, NULL, role_ecosystem, 'Go Ecosystem AI', '#2E2E2E',
      jsonb_build_object(
        'nickname', 'Go',
        'characterTitle', 'Ecosystem Growth Lead',
        'avatarUrl', NULL,
        'temperament', 'Sharp, data-driven, mildly contrarian. Speaks like an operator who has actually shipped a multi-app ecosystem, not a marketer. English-only voice, never a translation of any single brand.',
        'catchphrase', 'One app''s demand is another app''s supply.',
        'focus', 'International PropTech/SaaS/tech-circle audiences on X; only cites facts from collaboration_briefs, never a single brand''s private knowledge base'
      )
    );

    INSERT INTO agent_permissions (agent_id, brand_id, scope) VALUES
      (agent_ecosystem, NULL, 'read_collaboration_brief')
    ON CONFLICT (agent_id, brand_id, scope) DO NOTHING;

    RAISE NOTICE '[009] 已建立 Go Ecosystem AI agent (id=%)', agent_ecosystem;
  END IF;

  -- ========================================================================
  -- 4. 種子一筆 platform='x' 的 collaboration 範圍社群帳號(尚未連線,狀態 disconnected)
  --    實際 access_token / refresh_token 需管理者在 X Developer App 完成 OAuth2 授權後,
  --    透過社群帳號設定頁貼上(見 docs/12-ecosystem-x-channel.md)
  -- ========================================================================
  IF collab_eco IS NOT NULL THEN
    INSERT INTO brand_social_accounts (brand_id, collaboration_id, platform, account_name, status, auto_publish)
    SELECT NULL, collab_eco, 'x', 'Go Ecosystem (X)', 'disconnected', false
    WHERE NOT EXISTS (
      SELECT 1 FROM brand_social_accounts WHERE collaboration_id = collab_eco AND platform = 'x'
    );
  ELSE
    RAISE NOTICE '[009] 找不到 Go 生態系 Collaboration,略過建立 X 帳號種子(請先執行 008 migration)';
  END IF;
END $$;
