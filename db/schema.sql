-- ============================================================================
-- GO Marketing Center — PostgreSQL Schema (V1)
-- ============================================================================
-- 設計原則:
--   1. 每個品牌都是獨立 Workspace,幾乎所有表都帶 brand_id 並設 NOT NULL + FK,
--      在資料庫層面強制品牌隔離(Principle 1 / 2)。
--   2. 品牌合作透過 collaborations / collaboration_brands / collaboration_briefs,
--      AI 只能讀 Brief,不得跨讀對方 Brand Knowledge(Principle 3)。
--   3. AI 只能產出 proposals,真正的 decisions 一律由 users(管理者)寫入
--      (Principle 4 / 5 / 6)。
--   4. activity_logs 是唯一的全域事件流,任何動作都可回溯 actor/時間/前後值
--      (Principle 7)。
--   5. Brand Knowledge 版本化(brand_versions),Learning 資料與 Brand Core 分離,
--      AI 只能建議修改,不能直接寫入已發布版本。
--
-- 慣例:
--   - 主鍵一律 UUID(gen_random_uuid())
--   - 每張表皆有 created_at / updated_at(updated_at 由 trigger 自動維護)
--   - 狀態欄一律使用 ENUM,彈性/半結構化資料使用 JSONB
--   - 外鍵預設 ON DELETE RESTRICT,僅子表/明細表使用 CASCADE
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;        -- 不分大小寫的唯一鍵(email/slug)

-- ============================================================================
-- 共用工具:updated_at 自動更新 trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ENUM 型別
-- ============================================================================

CREATE TYPE user_role AS ENUM (
  'super_admin',        -- 集團管理者,可見所有品牌
  'brand_manager',      -- 品牌負責人,擁有該品牌最終決策權
  'brand_editor',       -- 品牌內容編輯,可操作但不可最終批准
  'viewer'              -- 唯讀
);

CREATE TYPE brand_version_status AS ENUM ('draft', 'published', 'archived');

CREATE TYPE verification_status AS ENUM ('verified', 'claimed', 'pending');

CREATE TYPE brand_rule_type AS ENUM (
  'can_claim',          -- 可宣稱(需條件)
  'cannot_claim',       -- 不可宣稱 / 禁用詞
  'marketing_rule',     -- 一般行銷規則
  'negative_rule'       -- 負面表列(絕對禁止)
);

CREATE TYPE document_source_type AS ENUM (
  'website', 'presentation', 'logo', 'social_post', 'product_intro',
  'past_article', 'video', 'pdf', 'image', 'brand_manual', 'faq',
  'press_article', 'press_release', 'dm', 'other'
);

CREATE TYPE press_coverage_status AS ENUM ('inbox', 'published', 'syndicated', 'dismissed');
CREATE TYPE press_discovery_source AS ENUM ('manual', 'scheduler');
CREATE TYPE press_release_status AS ENUM ('draft', 'pending_review', 'approved', 'final');

CREATE TYPE asset_type AS ENUM ('logo', 'image', 'video', 'document', 'color_palette', 'font');

CREATE TYPE market_signal_type AS ENUM (
  'news', 'policy', 'current_event', 'trending_topic',
  'industry_trend', 'social_content', 'evergreen'
);

CREATE TYPE market_signal_status AS ENUM ('new', 'discussed', 'used', 'dismissed');

CREATE TYPE meeting_status AS ENUM ('scheduled', 'in_progress', 'concluded', 'archived');

CREATE TYPE meeting_participant_type AS ENUM ('user', 'ai_agent');

CREATE TYPE proposal_status AS ENUM (
  'pending_decision', 'approved', 'rejected', 'needs_revision', 'withdrawn'
);

CREATE TYPE decision_action AS ENUM (
  'approve', 'modify_approve', 'reject', 'return_for_discussion', 'defer'
);

CREATE TYPE campaign_status AS ENUM (
  'planning', 'active', 'paused', 'completed', 'cancelled'
);

CREATE TYPE content_type AS ENUM (
  'article', 'image', 'video_prompt', 'video_script', 'edm', 'live_stream_plan'
);

CREATE TYPE content_status AS ENUM (
  'draft', 'pending_review', 'approved', 'needs_revision',
  'rejected', 'scheduled', 'published', 'archived'
);

CREATE TYPE content_review_action AS ENUM (
  'approve', 'modify', 'return', 'regenerate', 'postpone', 'reject'
);

CREATE TYPE publishing_platform AS ENUM (
  'instagram', 'facebook', 'threads', 'line_oa', 'tiktok', 'youtube', 'linkedin', 'x', 'edm'
);

CREATE TYPE publishing_job_status AS ENUM (
  'queued', 'scheduled', 'publishing', 'published', 'failed', 'cancelled'
);

CREATE TYPE learning_record_type AS ENUM (
  'content_performance', 'cta_effectiveness', 'audience_engagement', 'channel_insight', 'other'
);

CREATE TYPE agent_permission_scope AS ENUM (
  'read_brand_knowledge', 'read_market_signal', 'participate_meeting',
  'create_proposal', 'generate_content', 'read_collaboration_brief'
);

-- ============================================================================
-- 使用者與權限(人類)
-- ============================================================================

CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             CITEXT NOT NULL UNIQUE,
  username          CITEXT UNIQUE,                   -- 品牌登入帳號,super_admin 可為 NULL
  password_hash     TEXT,                            -- PBKDF2,僅品牌帳號使用
  display_name      TEXT NOT NULL,
  avatar_url        TEXT,
  role              user_role NOT NULL DEFAULT 'viewer',
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 品牌成員關聯(一個使用者可管理多個品牌,一個品牌可有多個成員)
CREATE TABLE brand_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL,   -- FK 於 brands 建立後補上
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              user_role NOT NULL DEFAULT 'viewer',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, user_id)
);

-- ============================================================================
-- Brand Intelligence(品牌智慧)
-- ============================================================================

CREATE TABLE brands (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              CITEXT NOT NULL UNIQUE,          -- e.g. 'homigo'
  name              TEXT NOT NULL,                   -- e.g. 'Homigo'
  tagline           TEXT,
  logo_url          TEXT,
  website_url       TEXT,                           -- 官方網站,給客戶 LINE 資訊包引用
  website_note      TEXT,                           -- 官網用途說明(例如產品入口、定價頁)
  primary_color     TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  current_version_id UUID,          -- 指向目前已發布的 brand_versions(於下方建立後補 FK)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brand_members
  ADD CONSTRAINT fk_brand_members_brand FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
CREATE INDEX idx_brand_members_brand ON brand_members(brand_id);
CREATE INDEX idx_brand_members_user ON brand_members(user_id);

-- 品牌版本:品牌知識的版本化容器。每次發布 = 一筆新紀錄。
CREATE TABLE brand_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,               -- 1, 2, 3...
  status            brand_version_status NOT NULL DEFAULT 'draft',
  summary_of_changes TEXT,                          -- 與上一版的差異摘要
  compiled_markdown TEXT,                           -- 發布時自動編譯的唯讀 MD 快照
  confidence_score  NUMERIC(4,3),                   -- Onboarding AI 產出時的信心分數
  published_by      UUID REFERENCES users(id),
  published_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, version_number)
);
CREATE INDEX idx_brand_versions_brand ON brand_versions(brand_id);
CREATE INDEX idx_brand_versions_status ON brand_versions(brand_id, status);
CREATE TRIGGER trg_brand_versions_updated_at BEFORE UPDATE ON brand_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE brands
  ADD CONSTRAINT fk_brands_current_version FOREIGN KEY (current_version_id) REFERENCES brand_versions(id);

-- 原始資料(Onboarding 上傳的官網/簡報/LOGO/社群/PDF...等,永久保留)
CREATE TABLE brand_documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  source_type       document_source_type NOT NULL,
  title             TEXT NOT NULL,
  file_url          TEXT,
  raw_content       TEXT,                           -- 純文字/MD 原始內容,或 AI 從 DM/簡報抽出的摘要
  key_points        JSONB NOT NULL DEFAULT '[]',    -- 可引用賣點 / 活動條件
  extract_status    TEXT NOT NULL DEFAULT 'pending', -- pending | ready | failed
  file_name         TEXT,
  mime_type         TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  uploaded_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_documents_brand ON brand_documents(brand_id);
CREATE INDEX idx_brand_documents_version ON brand_documents(brand_version_id);

-- 品牌資產(Logo / 圖片 / 影片 / 色票 / 字型)
CREATE TABLE brand_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  asset_type        asset_type NOT NULL,
  name              TEXT NOT NULL,
  file_url          TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_assets_brand ON brand_assets(brand_id);

-- 目標受眾(整體區隔,如「自管房東」)
CREATE TABLE brand_audiences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  name              TEXT NOT NULL,
  pain_points       JSONB NOT NULL DEFAULT '[]',     -- string[]
  appeal_angle      TEXT,
  lane              TEXT CHECK (lane IS NULL OR lane IN ('b2b', 'b2c')),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_audiences_brand ON brand_audiences(brand_id);
CREATE TRIGGER trg_brand_audiences_updated_at BEFORE UPDATE ON brand_audiences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 細分 Persona(如 TaskGo 的 P1~P6)
CREATE TABLE brand_personas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  audience_id       UUID REFERENCES brand_audiences(id) ON DELETE SET NULL,
  code              TEXT,                            -- 'P1'
  name              TEXT NOT NULL,
  age_range         TEXT,
  profile           TEXT,
  pain_points       JSONB NOT NULL DEFAULT '[]',
  appeal_angle      TEXT,
  lane              TEXT CHECK (lane IS NULL OR lane IN ('b2b', 'b2c')),
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_personas_brand ON brand_personas(brand_id);
CREATE TRIGGER trg_brand_personas_updated_at BEFORE UPDATE ON brand_personas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 品牌規則(事實邊界 / 禁止事項 / 行銷規則 / 核准數據)
CREATE TABLE brand_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  rule_type         brand_rule_type NOT NULL,
  statement         TEXT NOT NULL,
  condition_note    TEXT,                            -- 例如「須帶『依市場調查』前提」
  verification      verification_status NOT NULL DEFAULT 'pending',
  valid_until       DATE,                             -- 時效性內容(如優惠)到期日
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_rules_brand ON brand_rules(brand_id, rule_type);
CREATE TRIGGER trg_brand_rules_updated_at BEFORE UPDATE ON brand_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 視覺識別(色票 / 圖卡規格)
CREATE TABLE brand_visuals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  label             TEXT NOT NULL,                   -- '主色' / 'IG輪播尺寸'
  value             TEXT NOT NULL,                   -- '#3A8DDE' / '1080x1350'
  category          TEXT NOT NULL DEFAULT 'color',    -- color | layout | typography
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_visuals_brand ON brand_visuals(brand_id);

-- 各平台調性設定(FB/IG/Threads/X...)
CREATE TABLE brand_channels (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  platform          publishing_platform NOT NULL,
  tone_of_voice     TEXT,
  length_guideline  TEXT,
  format_guideline  TEXT,
  hashtag_count_min INTEGER,
  hashtag_count_max INTEGER,
  posting_frequency TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, platform, brand_version_id)
);
CREATE INDEX idx_brand_channels_brand ON brand_channels(brand_id);
CREATE TRIGGER trg_brand_channels_updated_at BEFORE UPDATE ON brand_channels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 關鍵字 / Hashtag / CTA 庫
CREATE TABLE brand_keywords (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  category          TEXT NOT NULL,                  -- hashtag | cta | key_message
  value             TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_keywords_brand ON brand_keywords(brand_id, category);

-- 品牌歷史 / 里程碑
CREATE TABLE brand_histories (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  happened_on       DATE NOT NULL,
  title             TEXT NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_histories_brand ON brand_histories(brand_id);

-- 敘事素材 / 內容支柱範例 / Before-After 故事種子
CREATE TABLE brand_examples (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  category          TEXT NOT NULL,                  -- content_pillar | storytelling | hot_topic_bank
  title             TEXT NOT NULL,
  body              TEXT,
  weight_percent    NUMERIC(5,2),                    -- 內容支柱佔比建議
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_brand_examples_brand ON brand_examples(brand_id, category);

-- 自家新聞稿(可存全文;內部草稿 → 審核 → 定稿)
CREATE TABLE press_releases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  status            press_release_status NOT NULL DEFAULT 'draft',
  embargo_on        DATE,
  review_note       TEXT,
  created_by        UUID REFERENCES users(id),
  updated_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_press_releases_brand ON press_releases(brand_id, status, updated_at DESC);
CREATE TRIGGER trg_press_releases_updated_at BEFORE UPDATE ON press_releases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 第三方媒體露出(不存全文,只存出處/摘要/短金句/可宣稱事實)
CREATE TABLE press_coverages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  press_release_id      UUID REFERENCES press_releases(id) ON DELETE SET NULL,
  story_key             TEXT NOT NULL,
  outlet                TEXT NOT NULL,
  headline              TEXT NOT NULL,
  article_url           TEXT,
  published_on          DATE,
  status                press_coverage_status NOT NULL DEFAULT 'inbox',
  discovery_source      press_discovery_source NOT NULL DEFAULT 'manual',
  summary               TEXT,
  key_quotes            JSONB NOT NULL DEFAULT '[]',
  claimable_facts       JSONB NOT NULL DEFAULT '[]',
  is_primary            BOOLEAN NOT NULL DEFAULT true,
  related_brand_slugs   JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_press_coverages_brand ON press_coverages(brand_id, status, published_on DESC);
CREATE INDEX idx_press_coverages_story ON press_coverages(brand_id, story_key);
CREATE UNIQUE INDEX idx_press_coverages_url ON press_coverages(brand_id, article_url)
  WHERE article_url IS NOT NULL;
CREATE TRIGGER trg_press_coverages_updated_at BEFORE UPDATE ON press_coverages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Market Intelligence(市場情報)
-- ============================================================================

CREATE TABLE market_signals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  signal_type       market_signal_type NOT NULL,
  title             TEXT NOT NULL,
  summary           TEXT,
  source_url        TEXT,
  relevance_score   NUMERIC(4,3),
  status            market_signal_status NOT NULL DEFAULT 'new',
  discovered_by_agent_id UUID,       -- FK 於 ai_agents 建立後補上
  discovered_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata          JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_market_signals_brand ON market_signals(brand_id, status);
CREATE INDEX idx_market_signals_type ON market_signals(signal_type);

-- ============================================================================
-- AI Agents / 角色 / 權限
-- ============================================================================

CREATE TABLE agent_roles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL UNIQUE,             -- 'brand_ai' | 'market_analyst' | ...
  name              TEXT NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_agents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,  -- NULL = 跨品牌通用 Agent(如 Market Analyst)
  role_id           UUID NOT NULL REFERENCES agent_roles(id),
  display_name      TEXT NOT NULL,                    -- 'Homigo AI'
  avatar_color      TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_agents_brand ON ai_agents(brand_id);

ALTER TABLE market_signals
  ADD CONSTRAINT fk_market_signals_agent FOREIGN KEY (discovered_by_agent_id) REFERENCES ai_agents(id);

CREATE TABLE agent_permissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,  -- 授權可存取的品牌;NULL 表示不限定(需搭配 scope)
  scope             agent_permission_scope NOT NULL,
  granted_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, brand_id, scope)
);
CREATE INDEX idx_agent_permissions_agent ON agent_permissions(agent_id);

-- ============================================================================
-- Collaboration(品牌合作)
-- ============================================================================

CREATE TABLE collaborations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,
  status            TEXT NOT NULL DEFAULT 'active',   -- active | closed
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_collaborations_updated_at BEFORE UPDATE ON collaborations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE collaboration_brands (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id  UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (collaboration_id, brand_id)
);
CREATE INDEX idx_collab_brands_collab ON collaboration_brands(collaboration_id);
CREATE INDEX idx_collab_brands_brand ON collaboration_brands(brand_id);

-- 合作簡報:AI 只能讀這個,不能讀完整 Brand Knowledge
CREATE TABLE collaboration_briefs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collaboration_id  UUID NOT NULL REFERENCES collaborations(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  content_markdown  TEXT NOT NULL,
  version_number    INTEGER NOT NULL DEFAULT 1,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_collab_briefs_collab ON collaboration_briefs(collaboration_id);

-- ============================================================================
-- AI Meeting Room
-- ============================================================================

CREATE TABLE meetings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,      -- 單品牌會議
  collaboration_id  UUID REFERENCES collaborations(id) ON DELETE CASCADE, -- 或跨品牌合作會議
  title             TEXT NOT NULL,
  topic             TEXT,
  status            meeting_status NOT NULL DEFAULT 'scheduled',
  initiated_by_type meeting_participant_type NOT NULL DEFAULT 'user',   -- 誰發起:人或 AI 主動提議題
  initiated_by_user_id  UUID REFERENCES users(id),
  initiated_by_agent_id UUID REFERENCES ai_agents(id),
  related_market_signal_id UUID REFERENCES market_signals(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_meeting_scope CHECK (brand_id IS NOT NULL OR collaboration_id IS NOT NULL)
);
CREATE INDEX idx_meetings_brand ON meetings(brand_id);
CREATE INDEX idx_meetings_collab ON meetings(collaboration_id);
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE meeting_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_type  meeting_participant_type NOT NULL,
  user_id           UUID REFERENCES users(id),
  agent_id          UUID REFERENCES ai_agents(id),
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_participant_identity CHECK (
    (participant_type = 'user' AND user_id IS NOT NULL AND agent_id IS NULL) OR
    (participant_type = 'ai_agent' AND agent_id IS NOT NULL AND user_id IS NULL)
  )
);
CREATE INDEX idx_meeting_participants_meeting ON meeting_participants(meeting_id);

CREATE TABLE meeting_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  sender_type       meeting_participant_type NOT NULL,
  sender_user_id    UUID REFERENCES users(id),
  sender_agent_id   UUID REFERENCES ai_agents(id),
  content           TEXT NOT NULL,
  reply_to_id       UUID REFERENCES meeting_messages(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_message_identity CHECK (
    (sender_type = 'user' AND sender_user_id IS NOT NULL AND sender_agent_id IS NULL) OR
    (sender_type = 'ai_agent' AND sender_agent_id IS NOT NULL AND sender_user_id IS NULL)
  )
);
CREATE INDEX idx_meeting_messages_meeting ON meeting_messages(meeting_id, created_at);

CREATE TABLE meeting_summaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  summary_markdown  TEXT NOT NULL,
  generated_by_agent_id UUID REFERENCES ai_agents(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_meeting_summaries_meeting ON meeting_summaries(meeting_id);

-- ============================================================================
-- Decision Center(AI 只能產出 Proposal,Decision 一律人工)
-- ============================================================================

CREATE TABLE proposals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,
  collaboration_id  UUID REFERENCES collaborations(id) ON DELETE CASCADE,
  meeting_id        UUID REFERENCES meetings(id),
  title             TEXT NOT NULL,
  status            proposal_status NOT NULL DEFAULT 'pending_decision',
  proposed_by_agent_id UUID REFERENCES ai_agents(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_proposal_scope CHECK (brand_id IS NOT NULL OR collaboration_id IS NOT NULL)
);
CREATE INDEX idx_proposals_brand ON proposals(brand_id, status);
CREATE TRIGGER trg_proposals_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 方案選項(方案 A / B / C):優缺點、風險、成本、品牌符合度、預估成效
CREATE TABLE proposal_options (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,                  -- '方案 A'
  description       TEXT,
  pros              JSONB NOT NULL DEFAULT '[]',
  cons              JSONB NOT NULL DEFAULT '[]',
  risk_level        TEXT,                            -- low | medium | high
  estimated_cost    NUMERIC(12,2),
  brand_fit_score   NUMERIC(5,2),                    -- 品牌符合度 %
  estimated_impact  JSONB NOT NULL DEFAULT '{}',      -- { reach, engagement, ... }
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposal_options_proposal ON proposal_options(proposal_id);

-- 管理者最終決策(永遠由 users 寫入,AI 不可寫)
CREATE TABLE decisions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id       UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  chosen_option_id  UUID REFERENCES proposal_options(id),
  action            decision_action NOT NULL,
  decided_by        UUID NOT NULL REFERENCES users(id),
  note              TEXT,
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_decisions_proposal ON decisions(proposal_id);

-- ============================================================================
-- Campaign / Content
-- ============================================================================

CREATE TABLE campaigns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_brand_id  UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  collaboration_id  UUID REFERENCES collaborations(id),
  decision_id       UUID REFERENCES decisions(id),     -- 追溯到當初核准此活動的決策
  title             TEXT NOT NULL,
  objective         TEXT,
  status            campaign_status NOT NULL DEFAULT 'planning',
  start_date        DATE,
  end_date          DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaigns_brand ON campaigns(primary_brand_id, status);
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 多品牌活動的參與品牌
CREATE TABLE campaign_brands (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  UNIQUE (campaign_id, brand_id)
);
CREATE INDEX idx_campaign_brands_campaign ON campaign_brands(campaign_id);

CREATE TABLE contents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),   -- 綁定生成當下的品牌版本
  content_type      content_type NOT NULL,
  target_platform   publishing_platform,
  title             TEXT,
  status            content_status NOT NULL DEFAULT 'draft',
  generated_by_agent_id UUID REFERENCES ai_agents(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contents_brand ON contents(brand_id, status);
CREATE INDEX idx_contents_campaign ON contents(campaign_id);
CREATE TRIGGER trg_contents_updated_at BEFORE UPDATE ON contents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 內容版本(每次重新生成/修改都留一筆)
CREATE TABLE content_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id        UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  version_number    INTEGER NOT NULL,
  body              TEXT,
  hashtags          JSONB NOT NULL DEFAULT '[]',
  cta               TEXT,
  seo_meta          JSONB NOT NULL DEFAULT '{}',
  generated_by_agent_id UUID REFERENCES ai_agents(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_id, version_number)
);
CREATE INDEX idx_content_versions_content ON content_versions(content_id);

CREATE TABLE content_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_version_id UUID NOT NULL REFERENCES content_versions(id) ON DELETE CASCADE,
  asset_type        asset_type NOT NULL,
  file_url          TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_assets_version ON content_assets(content_version_id);

-- 管理者最終審閱紀錄(人工審閱,可多輪)
CREATE TABLE content_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id        UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  content_version_id UUID REFERENCES content_versions(id),
  reviewer_id       UUID NOT NULL REFERENCES users(id),
  action            content_review_action NOT NULL,
  comment           TEXT,
  reviewed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_reviews_content ON content_reviews(content_id);

-- ============================================================================
-- Events(實體活動報名與報到;與 campaigns 行銷檔期不同語意,可選掛勾)
-- ============================================================================

CREATE TYPE event_status AS ENUM ('draft', 'open', 'closed', 'completed');
CREATE TYPE event_registration_status AS ENUM ('registered', 'cancelled');
CREATE TYPE event_registration_source AS ENUM ('web', 'manual');
CREATE TYPE event_referrer_commission_type AS ENUM ('percentage', 'fixed');

CREATE TABLE events (
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
  edm_images          JSONB NOT NULL DEFAULT '[]',   -- [{id,label,url}] 活動專屬 EDM
  price               NUMERIC(10,2),                 -- 拆帳計算用單價
  price_label         TEXT,                          -- 顯示用文案,如 "NT$499(原價699)"
  line_add_friend_url TEXT,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_brand ON events(brand_id, status);
CREATE UNIQUE INDEX idx_events_staff_token ON events(staff_token);
CREATE TRIGGER trg_events_updated_at BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 場次(上午/下午,可設名額上限)
CREATE TABLE event_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  starts_at   TIMESTAMPTZ,
  capacity    INTEGER,                                -- NULL = 不限
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_sessions_event ON event_sessions(event_id);

-- 推薦人名單(每活動自訂,含拆帳規則)
CREATE TABLE event_referrers (
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
CREATE INDEX idx_event_referrers_event ON event_referrers(event_id);
CREATE TRIGGER trg_event_referrers_updated_at BEFORE UPDATE ON event_referrers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 報名 / 票券 / 報到狀態三合一(對齊 ENG 專案設計,不另建 tickets/check_ins 表)
CREATE TABLE event_registrations (
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
CREATE INDEX idx_event_registrations_event_phone ON event_registrations(event_id, phone);
CREATE INDEX idx_event_registrations_qr ON event_registrations(qr_token);
CREATE INDEX idx_event_registrations_referrer ON event_registrations(referrer_id);
CREATE TRIGGER trg_event_registrations_updated_at BEFORE UPDATE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Publishing(發布)
-- ============================================================================

CREATE TABLE publishing_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id        UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  content_version_id UUID NOT NULL REFERENCES content_versions(id),
  platform          publishing_platform NOT NULL,
  status            publishing_job_status NOT NULL DEFAULT 'queued',
  scheduled_at      TIMESTAMPTZ,
  published_at      TIMESTAMPTZ,
  published_by      UUID REFERENCES users(id),
  external_post_id  TEXT,                            -- 平台回傳的貼文 ID
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_publishing_jobs_content ON publishing_jobs(content_id);
CREATE INDEX idx_publishing_jobs_status ON publishing_jobs(status, scheduled_at);
CREATE TRIGGER trg_publishing_jobs_updated_at BEFORE UPDATE ON publishing_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE publishing_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publishing_job_id UUID NOT NULL REFERENCES publishing_jobs(id) ON DELETE CASCADE,
  event             TEXT NOT NULL,                   -- 'queued' | 'retried' | 'failed' | 'published'
  detail            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_publishing_logs_job ON publishing_logs(publishing_job_id);

-- ============================================================================
-- Performance Tracking(成效追蹤)
-- ============================================================================

CREATE TABLE performance_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publishing_job_id UUID NOT NULL REFERENCES publishing_jobs(id) ON DELETE CASCADE,
  impressions       BIGINT NOT NULL DEFAULT 0,
  clicks            BIGINT NOT NULL DEFAULT 0,
  comments          BIGINT NOT NULL DEFAULT 0,
  shares            BIGINT NOT NULL DEFAULT 0,
  saves             BIGINT NOT NULL DEFAULT 0,
  engagement_rate   NUMERIC(6,4),
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_metrics       JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_performance_reports_job ON performance_reports(publishing_job_id);

-- ============================================================================
-- Learning(持續學習;永不觸碰 Brand Core)
-- ============================================================================

CREATE TABLE learning_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  brand_version_id  UUID REFERENCES brand_versions(id),
  record_type       learning_record_type NOT NULL,
  insight           TEXT NOT NULL,
  supporting_data   JSONB NOT NULL DEFAULT '{}',
  related_content_id UUID REFERENCES contents(id),
  generated_by_agent_id UUID REFERENCES ai_agents(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_learning_records_brand ON learning_records(brand_id, record_type);

-- ============================================================================
-- Timeline / Activity Log(全域事件流,任何操作皆可回溯)
-- ============================================================================

CREATE TABLE activity_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID REFERENCES brands(id) ON DELETE CASCADE,
  collaboration_id  UUID REFERENCES collaborations(id) ON DELETE CASCADE,
  actor_type        meeting_participant_type NOT NULL,   -- 'user' | 'ai_agent'
  actor_user_id     UUID REFERENCES users(id),
  actor_agent_id    UUID REFERENCES ai_agents(id),
  action            TEXT NOT NULL,                  -- 'proposal.created' | 'decision.approved' | ...
  entity_type       TEXT NOT NULL,                  -- 'proposal' | 'content' | 'brand_version' | ...
  entity_id         UUID,
  before_state      JSONB,
  after_state       JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_logs_brand ON activity_logs(brand_id, created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);

-- ============================================================================
-- 品牌客服資料庫 / 系統問答小幫手（與 Brand Knowledge 分離）
-- ============================================================================

CREATE TABLE cs_knowledge_documents (
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
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cs_knowledge_documents_brand ON cs_knowledge_documents(brand_id, publish_status, created_at DESC);
CREATE TRIGGER trg_cs_knowledge_documents_updated_at BEFORE UPDATE ON cs_knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cs_knowledge_document_roles (
  document_id UUID NOT NULL REFERENCES cs_knowledge_documents(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  PRIMARY KEY (document_id, role)
);

CREATE TABLE product_help_settings (
  brand_id         UUID PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  widget_key       TEXT NOT NULL UNIQUE,
  welcome_by_role  JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_product_help_settings_updated_at BEFORE UPDATE ON product_help_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_help_origins (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id   UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  origin     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, origin)
);

CREATE TABLE product_help_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id     UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  role         TEXT NOT NULL,
  page_path    TEXT,
  source       TEXT NOT NULL DEFAULT 'web',
  widget_key   TEXT,
  client_hash  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_help_sessions_brand ON product_help_sessions(brand_id, created_at DESC);

CREATE TABLE product_help_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES product_help_sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  answered    BOOLEAN,
  citations   JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_help_messages_session ON product_help_messages(session_id, created_at);

CREATE TABLE product_help_tickets (
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
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_help_tickets_brand ON product_help_tickets(brand_id, status, created_at DESC);
CREATE TRIGGER trg_product_help_tickets_updated_at BEFORE UPDATE ON product_help_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 結尾:agent_roles 種子(角色本身不含品牌別,實際 Agent 於 seed.sql 建立)
-- ============================================================================

INSERT INTO agent_roles (code, name, description) VALUES
  ('brand_ai', '品牌 AI', '代表單一品牌人格,熟悉該品牌所有知識,僅能存取自己品牌'),
  ('market_analyst', 'Market Analyst', '市場情報分析,提供新聞/趨勢/話題洞察'),
  ('content_strategist', 'Content Strategist', '內容策略規劃與選題建議'),
  ('risk_advisor', 'Risk Advisor', '風險評估,檢查是否違反品牌規則與事實邊界'),
  ('devils_advocate', 'Devil''s Advocate', '刻意提出反對意見,避免團體迷思'),
  ('moderator', 'Moderator', '會議主持,彙整討論並生成提案摘要')
ON CONFLICT (code) DO NOTHING;
