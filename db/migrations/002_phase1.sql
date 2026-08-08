-- ============================================================================
-- Migration 002: 第一階段優化
--   1. brand_social_accounts(每品牌社群帳號串接設定)
--   2. market_signals 新欄位(自動蒐集來源 / 原始資料 / 是否自動產生)
--   3. contents 新欄位(AI 互動潛力評分 / 生成 prompt 中繼資料 / 來源情報)
--   4. contents.campaign_id 改為可空(允許從市場情報直接生成的獨立貼文)
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/002_phase1.sql
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE social_account_status AS ENUM ('disconnected', 'manual', 'connected', 'error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- brand_social_accounts(每品牌 FB 粉專 / IG 商業帳號 / Threads 帳號設定)
--   - access_token 由應用層以 AES-GCM 加密後存入(見 functions/_shared/crypto.ts)
--   - status: disconnected 未設定 / manual 手動發布模式 / connected API 已連線 / error 連線異常
-- ============================================================================
CREATE TABLE IF NOT EXISTS brand_social_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id         UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform         publishing_platform NOT NULL,
  account_name     TEXT,                              -- 粉專 / 帳號顯示名稱
  external_id      TEXT,                              -- FB page_id / IG business account id / Threads user id
  access_token_enc TEXT,                              -- 加密後的 access token
  token_expires_at TIMESTAMPTZ,
  status           social_account_status NOT NULL DEFAULT 'disconnected',
  notes            TEXT,
  connected_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_brand_social_accounts_brand ON brand_social_accounts(brand_id);

DROP TRIGGER IF EXISTS trg_brand_social_accounts_updated_at ON brand_social_accounts;
CREATE TRIGGER trg_brand_social_accounts_updated_at BEFORE UPDATE ON brand_social_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- market_signals 擴充:自動蒐集管線用欄位
-- ============================================================================
ALTER TABLE market_signals ADD COLUMN IF NOT EXISTS source_platform TEXT;            -- google_trends | rss | ptt | dcard | manual
ALTER TABLE market_signals ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}';
ALTER TABLE market_signals ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_market_signals_source ON market_signals(source_platform, discovered_at DESC);

-- ============================================================================
-- contents 擴充:AI 生成中繼資料與互動潛力評分
-- ============================================================================
ALTER TABLE contents ADD COLUMN IF NOT EXISTS predicted_engagement_score NUMERIC(4,1); -- 0-100,AI 預估互動潛力
ALTER TABLE contents ADD COLUMN IF NOT EXISTS engagement_analysis TEXT;                -- AI 評估說明與改進建議
ALTER TABLE contents ADD COLUMN IF NOT EXISTS generation_prompt_meta JSONB NOT NULL DEFAULT '{}';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS source_market_signal_id UUID REFERENCES market_signals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_contents_source_signal ON contents(source_market_signal_id);

-- 允許不掛 campaign 的獨立貼文(從市場情報直接生成)
ALTER TABLE contents ALTER COLUMN campaign_id DROP NOT NULL;
