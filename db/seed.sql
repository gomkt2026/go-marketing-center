-- ============================================================================
-- GO Marketing Center — 種子資料(V1)
-- ============================================================================
-- 以 Homigo / TaskGo / Washgo 三個真實品牌的既有行銷文件為基礎(data/brands/),
-- 拆解為結構化知識條目,並補足一組完整的流程情境(會議 → 提案 → 決策 →
-- 活動 → 內容 → 審閱 → 發布 → 成效 → 學習),供前端展示與功能驗證使用。
--
-- 執行方式: psql "$DATABASE_URL" -f db/seed.sql
-- 注意: 本腳本會先清空業務資料表(TRUNCATE ... CASCADE),僅保留 schema.sql
--       已種入的 agent_roles。可重複執行。
-- ============================================================================

BEGIN;

TRUNCATE TABLE
  activity_logs, learning_records, performance_reports, publishing_logs,
  publishing_jobs, content_reviews, content_assets, content_versions, contents,
  campaign_brands, campaigns, decisions, proposal_options, proposals,
  meeting_summaries, meeting_messages, meeting_participants, meetings,
  collaboration_briefs, collaboration_brands, collaborations,
  agent_permissions, ai_agents,
  market_signals,
  brand_examples, brand_histories, brand_keywords, brand_channels, brand_visuals,
  brand_rules, brand_personas, brand_audiences, brand_assets, brand_documents,
  brand_versions, brand_members, brands,
  users
RESTART IDENTITY CASCADE;

DO $$
DECLARE
  -- 使用者
  u_admin        UUID := gen_random_uuid();
  u_homigo_mgr   UUID := gen_random_uuid();
  u_taskgo_mgr   UUID := gen_random_uuid();
  u_washgo_mgr   UUID := gen_random_uuid();

  -- 品牌
  b_homigo       UUID := gen_random_uuid();
  b_taskgo       UUID := gen_random_uuid();
  b_washgo       UUID := gen_random_uuid();

  -- 品牌版本
  v_homigo_1     UUID := gen_random_uuid();
  v_taskgo_1     UUID := gen_random_uuid();
  v_washgo_1     UUID := gen_random_uuid();

  -- AI Agent 角色 id(對應 schema.sql 已種入的 agent_roles)
  r_brand_ai     UUID;
  r_market       UUID;
  r_content      UUID;
  r_risk         UUID;
  r_devil        UUID;
  r_moderator    UUID;

  -- AI Agents
  a_homigo_ai    UUID := gen_random_uuid();
  a_taskgo_ai    UUID := gen_random_uuid();
  a_washgo_ai    UUID := gen_random_uuid();
  a_market       UUID := gen_random_uuid();
  a_content      UUID := gen_random_uuid();
  a_risk         UUID := gen_random_uuid();
  a_devil        UUID := gen_random_uuid();
  a_moderator    UUID := gen_random_uuid();

  -- Collaboration
  collab_1       UUID := gen_random_uuid();

  -- Market signal
  ms_rent_policy UUID := gen_random_uuid();
  ms_typhoon     UUID := gen_random_uuid();
  ms_labor       UUID := gen_random_uuid();

  -- Meeting / Proposal / Decision / Campaign / Content(Homigo 完整流程)
  m_homigo_1     UUID := gen_random_uuid();
  msg1 UUID; msg2 UUID; msg3 UUID; msg4 UUID; msg5 UUID;
  sum_homigo_1   UUID := gen_random_uuid();
  p_homigo_1     UUID := gen_random_uuid();
  po_a UUID := gen_random_uuid();
  po_b UUID := gen_random_uuid();
  po_c UUID := gen_random_uuid();
  d_homigo_1     UUID := gen_random_uuid();
  camp_homigo_1  UUID := gen_random_uuid();
  ct_homigo_1    UUID := gen_random_uuid();
  cv_homigo_1_1  UUID := gen_random_uuid();
  cv_homigo_1_2  UUID := gen_random_uuid();
  pj_homigo_1    UUID := gen_random_uuid();

  -- TaskGo 第二條流程(缺工國安話題,已發布)
  m_taskgo_1     UUID := gen_random_uuid();
  p_taskgo_1     UUID := gen_random_uuid();
  po_taskgo_a UUID := gen_random_uuid();
  po_taskgo_b UUID := gen_random_uuid();
  d_taskgo_1     UUID := gen_random_uuid();
  camp_taskgo_1  UUID := gen_random_uuid();
  ct_taskgo_1    UUID := gen_random_uuid();
  cv_taskgo_1_1  UUID := gen_random_uuid();
  pj_taskgo_1    UUID := gen_random_uuid();

  -- Washgo 第三條流程(換季收納,待審閱中)
  camp_washgo_1  UUID := gen_random_uuid();
  ct_washgo_1    UUID := gen_random_uuid();
  cv_washgo_1_1  UUID := gen_random_uuid();

  -- Collaboration proposal(修繕串接里程碑)
  p_collab_1     UUID := gen_random_uuid();
  po_collab_a UUID := gen_random_uuid();
  d_collab_1     UUID := gen_random_uuid();

BEGIN

  SELECT id INTO r_brand_ai  FROM agent_roles WHERE code = 'brand_ai';
  SELECT id INTO r_market    FROM agent_roles WHERE code = 'market_analyst';
  SELECT id INTO r_content   FROM agent_roles WHERE code = 'content_strategist';
  SELECT id INTO r_risk      FROM agent_roles WHERE code = 'risk_advisor';
  SELECT id INTO r_devil     FROM agent_roles WHERE code = 'devils_advocate';
  SELECT id INTO r_moderator FROM agent_roles WHERE code = 'moderator';

  -- ==========================================================================
  -- 使用者
  -- ==========================================================================
  INSERT INTO users (id, email, display_name, role) VALUES
    (u_admin,      'admin@go-mkt.tw',    '張大高(集團管理者)', 'super_admin'),
    (u_homigo_mgr, 'manager@homigo.tw',  'Homigo 品牌負責人',  'brand_manager'),
    (u_taskgo_mgr, 'manager@taskgo.tw',  'TaskGo 品牌負責人',  'brand_manager'),
    (u_washgo_mgr, 'manager@washgo.tw',  'Washgo 品牌負責人',  'brand_manager');

  -- ==========================================================================
  -- 品牌與版本
  -- ==========================================================================
  INSERT INTO brands (id, slug, name, tagline, primary_color, is_active) VALUES
    (b_homigo, 'homigo', 'Homigo', '不是管理房子,而是讓房子自己運作。', '#A7C18D', true),
    (b_taskgo, 'taskgo', 'TaskGo', '讓工程專案管理更簡單、更智能', '#ED9121', true),
    (b_washgo, 'washgo', 'Washgo', '衣物送洗,交給 Washgo', '#A87C64', true);

  INSERT INTO brand_members (brand_id, user_id, role) VALUES
    (b_homigo, u_admin, 'super_admin'),
    (b_taskgo, u_admin, 'super_admin'),
    (b_washgo, u_admin, 'super_admin'),
    (b_homigo, u_homigo_mgr, 'brand_manager'),
    (b_taskgo, u_taskgo_mgr, 'brand_manager'),
    (b_washgo, u_washgo_mgr, 'brand_manager');

  INSERT INTO brand_versions (id, brand_id, version_number, status, summary_of_changes, confidence_score, published_by, published_at) VALUES
    (v_homigo_1, b_homigo, 1, 'published', '首版發布:依 HOMIGO_BRAND_PROFILE.md v1.0 拆解建立', 0.93, u_homigo_mgr, now() - interval '20 days'),
    (v_taskgo_1, b_taskgo, 1, 'published', '首版發布:依 TaskGo_品牌行銷資料.md 拆解建立',      0.90, u_taskgo_mgr, now() - interval '18 days'),
    (v_washgo_1, b_washgo, 1, 'published', '首版發布:依 WASHGO_BRAND_MARKETING.md 拆解建立',    0.88, u_washgo_mgr, now() - interval '15 days');

  UPDATE brands SET current_version_id = v_homigo_1 WHERE id = b_homigo;
  UPDATE brands SET current_version_id = v_taskgo_1 WHERE id = b_taskgo;
  UPDATE brands SET current_version_id = v_washgo_1 WHERE id = b_washgo;

  -- ==========================================================================
  -- Brand Documents(原始資料索引,永久保留)
  -- ==========================================================================
  INSERT INTO brand_documents (brand_id, brand_version_id, source_type, title, file_url, uploaded_by) VALUES
    (b_homigo, v_homigo_1, 'brand_manual', 'Homigo 品牌行銷資料檔 v1.0', 'data/brands/HOMIGO_BRAND_PROFILE.md', u_homigo_mgr),
    (b_taskgo, v_taskgo_1, 'brand_manual', 'TaskGo 品牌行銷資料', 'data/brands/TASKGO_BRAND_MARKETING.md', u_taskgo_mgr),
    (b_washgo, v_washgo_1, 'brand_manual', 'Washgo 品牌行銷聖經', 'data/brands/WASHGO_BRAND_MARKETING.md', u_washgo_mgr);

  -- ==========================================================================
  -- Brand Audiences / Personas
  -- ==========================================================================
  INSERT INTO brand_audiences (brand_id, brand_version_id, name, pain_points, appeal_angle, sort_order) VALUES
    (b_homigo, v_homigo_1, '自管房東(1~10間)', '["收租、報修、續約全靠自己記"]', '每天只看一眼的自動化', 1),
    (b_homigo, v_homigo_1, '包租代管業者', '["多物件多房東,人力吃緊"]', '三視角管理、指揮中心、規模化', 2),
    (b_homigo, v_homigo_1, '房客(20~40歲租屋族)', '["報修沒下文", "押金爭議", "信用無累積"]', '透明進度、HomiScore 信用資產', 3),
    (b_washgo, v_washgo_1, '忙碌上班族/雙薪家庭', '["沒時間洗", "沒時間拿"]', '到府收送、LINE 下單、時間還給自己', 1),
    (b_washgo, v_washgo_1, '精緻衣物擁有者', '["西裝、大衣、禮服、名牌怕洗壞"]', '專業品管、電子簽名、AI 洗護', 2),
    (b_washgo, v_washgo_1, '傳統洗衣店主(B2B)', '["手寫單、電話聯絡、客源老化"]', '數位轉型零門檻、年輕客群從 LINE 進來', 3);

  INSERT INTO brand_personas (brand_id, brand_version_id, code, name, age_range, profile, pain_points, appeal_angle, sort_order) VALUES
    (b_taskgo, v_taskgo_1, 'P1', '工程行老闆 / 工班頭(OWNER)', '30-55',
      '同時管 3-10 個工地,手機不離身,LINE 群組幾十個',
      '["每天下午的今天做到哪奪命連環call", "排班燒腦", "月底才知道案子賠錢"]',
      '省時間、看得到錢、掌控感', 1),
    (b_taskgo, v_taskgo_1, 'P2', '工地主任 / 專案經理(PM)', NULL, NULL,
      '["口頭交代大家都忘", "缺失追不完", "照片文件散在群組"]',
      '留紀錄、追改善、進度自動彙整', 2),
    (b_taskgo, v_taskgo_1, 'P3', '現場師傅 / 工班成員', '50-60',
      '含老師傅,「阮嘸會用APP啦」但LINE玩得很溜',
      '["怕麻煩、怕學新東西", "請款單寫了沒下文"]',
      '不用裝APP、會傳早安圖就會用', 3),
    (b_taskgo, v_taskgo_1, 'P5', '房東 / 物管(Homigo 受眾)', NULL, NULL,
      '["租客報修電話接不完", "找不到可靠廠商"]',
      '報修線上填單、案件自動派給TaskGo廠商', 5);

  -- ==========================================================================
  -- Brand Rules(事實邊界 / 禁止事項 / 核准數據)
  -- ==========================================================================
  INSERT INTO brand_rules (brand_id, brand_version_id, rule_type, statement, condition_note, verification, sort_order) VALUES
    (b_homigo, v_homigo_1, 'can_claim', '依 Homigo 目前市場調查,為包租代管軟體首創的 TaskGo 串接', '必須帶「依 Homigo 目前市場調查」前提', 'claimed', 1),
    (b_homigo, v_homigo_1, 'cannot_claim', '市佔率第一、用戶數字(除非另行提供官方數據)、「保證」性承諾', NULL, 'pending', 2),
    (b_homigo, v_homigo_1, 'negative_rule', '不得生成任何暗示可規避法規(如逃漏稅、違建出租)的內容', NULL, 'verified', 3),
    (b_homigo, v_homigo_1, 'marketing_rule', 'TaskGo / Washgo 為合作生態夥伴,不可宣稱為 Homigo 自有品牌', NULL, 'verified', 4),

    (b_taskgo, v_taskgo_1, 'can_claim', '500+ 團隊使用', '官網信任數據,可直接使用', 'verified', 1),
    (b_taskgo, v_taskgo_1, 'can_claim', '派工時間減少 70%', '客戶案例數據,可用該句式', 'verified', 2),
    (b_taskgo, v_taskgo_1, 'can_claim', '免費試用 14 天', '官網 CTA', 'verified', 3),
    (b_taskgo, v_taskgo_1, 'cannot_claim', '自創百分比、「全台第一/市佔最高」等無法佐證的最高級用語', NULL, 'verified', 4),
    (b_taskgo, v_taskgo_1, 'negative_rule', 'Washgo 未上線前,不得生成 Washgo 貼文、不得宣稱其已可使用', '已於 Collaboration Brief 中統一狀態說明', 'verified', 5),

    (b_washgo, v_washgo_1, 'cannot_claim', '5,000+ 服務客戶 / 98% 客戶滿意度', '官網宣稱數字,未經核實,需人工確認後才可使用', 'pending', 1),
    (b_washgo, v_washgo_1, 'can_claim', 'GoCoin 1 點 = NT$1,跨品牌通用,永久不過期', '產品事實', 'verified', 2),
    (b_washgo, v_washgo_1, 'marketing_rule', '新會員禮:加入 @washgo 領 100 GoCoin', '時效性內容,發文前需確認活動仍有效', 'claimed', 3),
    (b_washgo, v_washgo_1, 'negative_rule', 'Washgo 是衣物洗滌/乾洗平台,不是洗車,不得出現洗車聯想', NULL, 'verified', 4);

  UPDATE brand_rules SET valid_until = (now() + interval '60 days')::date
    WHERE brand_id = b_washgo AND statement LIKE '新會員禮%';

  -- ==========================================================================
  -- Brand Channels(平台調性)
  -- ==========================================================================
  INSERT INTO brand_channels (brand_id, brand_version_id, platform, tone_of_voice, length_guideline, format_guideline, hashtag_count_min, hashtag_count_max) VALUES
    (b_homigo, v_homigo_1, 'facebook', '完整敘事、專業可信', '長文', '痛點 → 解法 → CTA,搭配輪播圖卡', 2, 3),
    (b_homigo, v_homigo_1, 'instagram', '視覺優先、生活感', '短文', '4:5 輪播(1080x1350)、限動、Reels 腳本', 8, 15),
    (b_homigo, v_homigo_1, 'threads', '口語、短、敢聊時事', '1-3 段', '可蹭租屋話題、開放留言互動', 3, 5),
    (b_taskgo, v_taskgo_1, 'threads', '台味短文、工地共鳴梗,可用台語詞', '前3行決定生死', '結尾必留互動問句', 3, 5),
    (b_taskgo, v_taskgo_1, 'facebook', '誠懇前輩分享、故事完整有頭有尾', '300-800字', '首兩行破題,搭配1-4張對比圖', 2, 3),
    (b_washgo, v_washgo_1, 'threads', '口語、貼近生活、像朋友抱怨', '1-3句', '先共鳴再置入,品牌名可放留言區', 0, 2),
    (b_washgo, v_washgo_1, 'instagram', '視覺優先短hook', '100-200字', '第一張強hook,輪播教學', 8, 15);

  -- ==========================================================================
  -- Brand Keywords(Hashtag / CTA / Key Message)
  -- ==========================================================================
  INSERT INTO brand_keywords (brand_id, brand_version_id, category, value) VALUES
    (b_homigo, v_homigo_1, 'hashtag', '#Homigo'), (b_homigo, v_homigo_1, 'hashtag', '#包租代管'),
    (b_homigo, v_homigo_1, 'hashtag', '#租屋族'), (b_homigo, v_homigo_1, 'hashtag', '#報修'),
    (b_homigo, v_homigo_1, 'cta', '加 LINE 免費開始'), (b_homigo, v_homigo_1, 'cta', '左滑看更多'),
    (b_homigo, v_homigo_1, 'key_message', '不是管理房子,而是讓房子自己運作。'),
    (b_homigo, v_homigo_1, 'key_message', '每天只需要看一眼。'),

    (b_taskgo, v_taskgo_1, 'hashtag', '#做工的人'), (b_taskgo, v_taskgo_1, 'hashtag', '#工地日常'),
    (b_taskgo, v_taskgo_1, 'hashtag', '#派工'), (b_taskgo, v_taskgo_1, 'hashtag', '#工程行'),
    (b_taskgo, v_taskgo_1, 'cta', '免費試用 14 天,先用再說。'),
    (b_taskgo, v_taskgo_1, 'cta', '傳給你那個還在用白板排班的頭仔。'),
    (b_taskgo, v_taskgo_1, 'key_message', '工地人不是不懂科技,是以前的科技不懂工地。'),

    (b_washgo, v_washgo_1, 'hashtag', '#Washgo'), (b_washgo, v_washgo_1, 'hashtag', '#衣物送洗'),
    (b_washgo, v_washgo_1, 'hashtag', '#到府收送'), (b_washgo, v_washgo_1, 'hashtag', '#GoCoin'),
    (b_washgo, v_washgo_1, 'cta', '加入 @washgo 領取 100 GoCoin'),
    (b_washgo, v_washgo_1, 'key_message', '洗滌產業的智慧管理平台');

  -- ==========================================================================
  -- Brand Visuals(色票 / 圖卡規格)
  -- ==========================================================================
  INSERT INTO brand_visuals (brand_id, brand_version_id, label, value, category, sort_order) VALUES
    (b_homigo, v_homigo_1, 'IG輪播尺寸', '1080x1350 (4:5)', 'layout', 1),
    (b_washgo, v_washgo_1, '主色-深藍', '#1D4F8C', 'color', 1),
    (b_washgo, v_washgo_1, '主色-品牌藍', '#3A8DDE', 'color', 2),
    (b_washgo, v_washgo_1, '輔助色-天藍', '#6CC3F5', 'color', 3),
    (b_washgo, v_washgo_1, '強調色-金橘', '#FFB84D', 'color', 4);

  -- ==========================================================================
  -- Brand Histories(里程碑)
  -- ==========================================================================
  INSERT INTO brand_histories (brand_id, happened_on, title, description) VALUES
    (b_homigo, (now() - interval '90 days')::date, 'Homigo × TaskGo 修繕串接正式上線', '包租代管軟體首創的修繕串接功能'),
    (b_taskgo, (now() - interval '120 days')::date, '點工Go 上線', '全台點工媒合平台正式推出'),
    (b_washgo, (now() - interval '60 days')::date, 'GoCoin 跨品牌點數上線', '消費者可跨品牌通用點數折抵');

  -- ==========================================================================
  -- Brand Examples(內容支柱 / 敘事素材 / 熱點主題庫)
  -- ==========================================================================
  INSERT INTO brand_examples (brand_id, brand_version_id, category, title, body, weight_percent) VALUES
    (b_homigo, v_homigo_1, 'content_pillar', '痛點共鳴', '房東/房客日常慘況:LINE群追修繕、手抄對帳、押金爭議、報修沒下文', 30),
    (b_homigo, v_homigo_1, 'content_pillar', '產品亮點', '功能單點深入:一鍵找師傅、AI換裝、每日摘要、HomiScore', 25),
    (b_homigo, v_homigo_1, 'content_pillar', '時事借勢', '租金補貼政策、囤房稅、社宅新聞、颱風後修繕潮', 20),
    (b_taskgo, v_taskgo_1, 'content_pillar', '痛點共鳴型', '工地日常場景引發「這就是我」的共鳴,如代打卡、群組考古', 40),
    (b_taskgo, v_taskgo_1, 'content_pillar', '產業趨勢蹭熱度型', '缺工國安問題、ESG/碳費上路、AI取代工作', 20),
    (b_washgo, v_washgo_1, 'hot_topic_bank', '換季收納', '厚外套收之前沒洗,明年拿出來就是霉味 → 到府收送+專業洗護+智慧衣櫃建檔', NULL),
    (b_washgo, v_washgo_1, 'hot_topic_bank', '梅雨/潮濕發霉', '衣服晾三天還是濕的,房間都是味道 → 專業洗滌烘乾、48小時內交件', NULL);

  -- ==========================================================================
  -- Market Intelligence
  -- ==========================================================================
  INSERT INTO ai_agents (id, brand_id, role_id, display_name, avatar_color) VALUES
    (a_homigo_ai, b_homigo, r_brand_ai, 'Homigo AI', '#A7C18D'),
    (a_taskgo_ai, b_taskgo, r_brand_ai, 'TaskGo AI', '#ED9121'),
    (a_washgo_ai, b_washgo, r_brand_ai, 'Washgo AI', '#A87C64'),
    (a_market,    NULL,     r_market,    'Market Analyst', '#6C6C6C'),
    (a_content,   NULL,     r_content,   'Content Strategist', '#8AA6C2'),
    (a_risk,      NULL,     r_risk,      'Risk Advisor', '#D97B7B'),
    (a_devil,     NULL,     r_devil,     'Devil''s Advocate', '#B26FB2'),
    (a_moderator, NULL,     r_moderator, 'Moderator', '#7C9C7C');

  INSERT INTO agent_permissions (agent_id, brand_id, scope) VALUES
    (a_homigo_ai, b_homigo, 'read_brand_knowledge'), (a_homigo_ai, b_homigo, 'participate_meeting'),
    (a_homigo_ai, b_homigo, 'create_proposal'), (a_homigo_ai, b_homigo, 'generate_content'),
    (a_taskgo_ai, b_taskgo, 'read_brand_knowledge'), (a_taskgo_ai, b_taskgo, 'participate_meeting'),
    (a_taskgo_ai, b_taskgo, 'create_proposal'), (a_taskgo_ai, b_taskgo, 'generate_content'),
    (a_washgo_ai, b_washgo, 'read_brand_knowledge'), (a_washgo_ai, b_washgo, 'participate_meeting'),
    (a_washgo_ai, b_washgo, 'create_proposal'), (a_washgo_ai, b_washgo, 'generate_content'),
    (a_market, b_homigo, 'read_market_signal'), (a_market, b_taskgo, 'read_market_signal'), (a_market, b_washgo, 'read_market_signal'),
    (a_market, b_homigo, 'participate_meeting'), (a_market, b_taskgo, 'participate_meeting'), (a_market, b_washgo, 'participate_meeting'),
    (a_risk, b_homigo, 'participate_meeting'), (a_risk, b_taskgo, 'participate_meeting'), (a_risk, b_washgo, 'participate_meeting'),
    (a_devil, b_homigo, 'participate_meeting'), (a_devil, b_taskgo, 'participate_meeting'), (a_devil, b_washgo, 'participate_meeting'),
    (a_moderator, b_homigo, 'participate_meeting'), (a_moderator, b_taskgo, 'participate_meeting'), (a_moderator, b_washgo, 'participate_meeting'),
    (a_homigo_ai, NULL, 'read_collaboration_brief'), (a_taskgo_ai, NULL, 'read_collaboration_brief');

  INSERT INTO market_signals (id, brand_id, signal_type, title, summary, relevance_score, status, discovered_by_agent_id, discovered_at) VALUES
    (ms_rent_policy, b_homigo, 'policy', '租金補貼加碼政策新聞', '政府擴大租金補貼申請資格,租屋族詢問度上升', 0.870, 'discussed', a_market, now() - interval '2 days'),
    (ms_typhoon, b_homigo, 'current_event', '颱風後修繕潮', '近期颱風過境,社群大量討論住家修繕需求', 0.810, 'new', a_market, now() - interval '1 days'),
    (ms_labor, b_taskgo, 'industry_trend', '缺工國安問題延燒', '產業缺工話題持續佔據新聞版面', 0.760, 'used', a_market, now() - interval '5 days');

  -- ==========================================================================
  -- Collaboration: Homigo × TaskGo 修繕串接
  -- ==========================================================================
  INSERT INTO collaborations (id, title, description, status, created_by) VALUES
    (collab_1, 'Homigo × TaskGo 修繕生態合作', '房客報修需求(Homigo)直通修繕供給(TaskGo)派工,雙方共用單一事實來源避免品牌描述矛盾', 'active', u_admin);

  INSERT INTO collaboration_brands (collaboration_id, brand_id) VALUES
    (collab_1, b_homigo), (collab_1, b_taskgo);

  INSERT INTO collaboration_briefs (collaboration_id, title, content_markdown, version_number, created_by) VALUES
    (collab_1, 'Homigo × TaskGo 修繕串接 Brief', E'# Homigo × TaskGo 修繕串接\n\n## 事實(唯一版本,取代雙方文件中互相矛盾的描述)\n\n- 依 Homigo 目前市場調查,為包租代管軟體首創的 TaskGo 串接(已上線)\n- 流程:房客報修 → Homigo 建立案件 → 自動流向 TaskGo 修繕廠商(指定派工或市集競價)→ 廠商施工回報 → 進度自動回流 Homigo\n- Washgo 現況:狀態由各品牌自行維護,不在此 Brief 中背書,亦不得作為本合作案的內容素材\n\n## 貼文角度授權\n\n- 房東視角(Homigo 發布)、廠商視角(TaskGo 發布)皆可各自使用,但雙方發布前仍需各自品牌負責人核准', 1, u_admin);

  -- ==========================================================================
  -- 流程一:Homigo 中秋檔期(完整走完 會議→提案→決策→活動→內容→審閱→發布→成效→學習)
  -- ==========================================================================
  INSERT INTO meetings (id, brand_id, title, topic, status, initiated_by_type, initiated_by_agent_id, related_market_signal_id, created_at) VALUES
    (m_homigo_1, b_homigo, '中秋檔期怎麼打?', '結合租屋搬遷潮與報修需求規劃中秋內容', 'concluded', 'ai_agent', a_market, ms_rent_policy, now() - interval '10 days');

  INSERT INTO meeting_participants (meeting_id, participant_type, agent_id) VALUES
    (m_homigo_1, 'ai_agent', a_homigo_ai), (m_homigo_1, 'ai_agent', a_market),
    (m_homigo_1, 'ai_agent', a_risk), (m_homigo_1, 'ai_agent', a_devil), (m_homigo_1, 'ai_agent', a_moderator);
  INSERT INTO meeting_participants (meeting_id, participant_type, user_id) VALUES
    (m_homigo_1, 'user', u_homigo_mgr);

  msg1 := gen_random_uuid(); msg2 := gen_random_uuid(); msg3 := gen_random_uuid();
  msg4 := gen_random_uuid(); msg5 := gen_random_uuid();

  INSERT INTO meeting_messages (id, meeting_id, sender_type, sender_agent_id, content, created_at) VALUES
    (msg1, m_homigo_1, 'ai_agent', a_market, '中秋前租屋搬遷需求上升,搭配租金補貼新聞,適合借勢。', now() - interval '10 days' + interval '1 min'),
    (msg2, m_homigo_1, 'ai_agent', a_homigo_ai, '建議主打「連假前把報修處理完」,呼應每天只看一眼的核心訊息。', now() - interval '10 days' + interval '3 min'),
    (msg3, m_homigo_1, 'ai_agent', a_devil, '中秋話題市場太擁擠,單純蹭節慶恐怕沒有記憶點,建議聚焦報修場景本身。', now() - interval '10 days' + interval '5 min'),
    (msg4, m_homigo_1, 'ai_agent', a_risk, '注意不可使用保證性字眼,若提及TaskGo串接需帶「依市場調查」前提。', now() - interval '10 days' + interval '6 min'),
    (msg5, m_homigo_1, 'ai_agent', a_moderator, '彙整三個方向為方案A/B/C,提交決策中心。', now() - interval '10 days' + interval '8 min');

  INSERT INTO meeting_summaries (meeting_id, summary_markdown, generated_by_agent_id) VALUES
    (m_homigo_1, '## 會議摘要\n\n共識:中秋檔期以「連假前報修」為核心場景,搭配三個方向產出提案。風險提醒已納入內容規則檢查。', a_moderator);

  INSERT INTO proposals (id, brand_id, meeting_id, title, status, proposed_by_agent_id, created_at) VALUES
    (p_homigo_1, b_homigo, m_homigo_1, '中秋檔期行銷提案', 'approved', a_moderator, now() - interval '9 days');

  INSERT INTO proposal_options (id, proposal_id, label, description, pros, cons, risk_level, estimated_cost, brand_fit_score, estimated_impact, sort_order) VALUES
    (po_a, p_homigo_1, '方案 A', '連假報修攻略圖文', '["實用性高", "延續品牌核心訊息"]', '["話題性較低"]', 'low', 3000, 95, '{"reach":"中","engagement":"中高"}', 1),
    (po_b, p_homigo_1, '方案 B', '中秋互動抽獎活動', '["互動率高", "帶新粉絲"]', '["需要抽獎成本", "與品牌調性稍偏娛樂"]', 'medium', 12000, 82, '{"reach":"高","engagement":"高"}', 2),
    (po_c, p_homigo_1, '方案 C', '不蹭中秋,發常青報修知識文', '["零風險", "可重複使用"]', '["話題性最低"]', 'low', 1500, 90, '{"reach":"低","engagement":"低"}', 3);

  INSERT INTO decisions (id, proposal_id, chosen_option_id, action, decided_by, note, decided_at) VALUES
    (d_homigo_1, p_homigo_1, po_a, 'approve', u_homigo_mgr, '採用方案A,聚焦報修場景,避免過度蹭節慶。', now() - interval '9 days' + interval '2 hours');

  INSERT INTO campaigns (id, primary_brand_id, decision_id, title, objective, status, start_date, end_date) VALUES
    (camp_homigo_1, b_homigo, d_homigo_1, 'Homigo 中秋報修攻略檔期', '延續「每天只看一眼」核心訊息,提升連假前報修轉換', 'active', (now() - interval '8 days')::date, (now() + interval '5 days')::date);

  INSERT INTO campaign_brands (campaign_id, brand_id) VALUES (camp_homigo_1, b_homigo);

  INSERT INTO contents (id, campaign_id, brand_id, brand_version_id, content_type, target_platform, title, status, generated_by_agent_id) VALUES
    (ct_homigo_1, camp_homigo_1, b_homigo, v_homigo_1, 'image', 'instagram', '連假前,把報修處理完', 'approved', a_content);

  INSERT INTO content_versions (id, content_id, version_number, body, hashtags, cta, generated_by_agent_id, created_at) VALUES
    (cv_homigo_1_1, ct_homigo_1, 1, '中秋連假想放空,卻還在等師傅回電?報修交給Homigo,一鍵找師傅、進度同步不用問。', '["#Homigo","#租屋","#報修"]', '加 LINE 免費開始', a_content, now() - interval '7 days'),
    (cv_homigo_1_2, ct_homigo_1, 2, '連假前,把報修處理完。房客報修不用再靠LINE找工班,一鍵媒合、進度同步查看。', '["#Homigo","#包租代管","#租屋族"]', '加 LINE 免費開始', a_content, now() - interval '6 days');

  INSERT INTO content_assets (content_version_id, asset_type, file_url) VALUES
    (cv_homigo_1_2, 'image', '/assets/mock/homigo-midautumn-card.png');

  INSERT INTO content_reviews (content_id, content_version_id, reviewer_id, action, comment, reviewed_at) VALUES
    (ct_homigo_1, cv_homigo_1_1, u_homigo_mgr, 'modify', '請把「中秋連假想放空」語氣改得更貼近品牌一貫的務實調性。', now() - interval '6 days' + interval '30 min'),
    (ct_homigo_1, cv_homigo_1_2, u_homigo_mgr, 'approve', '調整後符合品牌語調,核准發布。', now() - interval '5 days');

  INSERT INTO publishing_jobs (id, content_id, content_version_id, platform, status, scheduled_at, published_at, published_by) VALUES
    (pj_homigo_1, ct_homigo_1, cv_homigo_1_2, 'instagram', 'published', now() - interval '5 days', now() - interval '5 days', u_homigo_mgr);

  INSERT INTO publishing_logs (publishing_job_id, event, detail) VALUES
    (pj_homigo_1, 'published', '已成功發布至 Instagram');

  INSERT INTO performance_reports (publishing_job_id, impressions, clicks, comments, shares, saves, engagement_rate, captured_at) VALUES
    (pj_homigo_1, 18500, 620, 34, 58, 112, 0.0442, now() - interval '2 days');

  INSERT INTO learning_records (brand_id, brand_version_id, record_type, insight, related_content_id, generated_by_agent_id) VALUES
    (b_homigo, v_homigo_1, 'content_performance', '報修場景類圖文的收藏率明顯高於平均,建議提高此類內容佔比', ct_homigo_1, a_content);

  -- ==========================================================================
  -- 流程二:TaskGo 缺工國安話題(已發布完成)
  -- ==========================================================================
  INSERT INTO meetings (id, brand_id, title, topic, status, initiated_by_type, initiated_by_agent_id, related_market_signal_id, created_at) VALUES
    (m_taskgo_1, b_taskgo, '缺工國安議題借勢', '產業缺工話題延燒,討論TaskGo借勢角度', 'concluded', 'ai_agent', a_market, ms_labor, now() - interval '14 days');

  INSERT INTO meeting_participants (meeting_id, participant_type, agent_id) VALUES
    (m_taskgo_1, 'ai_agent', a_taskgo_ai), (m_taskgo_1, 'ai_agent', a_market), (m_taskgo_1, 'ai_agent', a_moderator);

  INSERT INTO proposals (id, brand_id, meeting_id, title, status, proposed_by_agent_id, created_at) VALUES
    (p_taskgo_1, b_taskgo, m_taskgo_1, '缺工國安議題貼文提案', 'approved', a_moderator, now() - interval '13 days');

  INSERT INTO proposal_options (id, proposal_id, label, description, pros, cons, risk_level, estimated_cost, brand_fit_score, estimated_impact, sort_order) VALUES
    (po_taskgo_a, p_taskgo_1, '方案 A', '缺工是國安問題,反轉為「點工Go」解方', '["產業趨勢蹭熱度型", "導流點工Go"]', '["需精準拿捏立場,避免消費產業困境"]', 'low', 0, 88, '{"reach":"高"}', 1),
    (po_taskgo_b, p_taskgo_1, '方案 B', '純數據型貼文(派工效率提升70%)', '["零風險", "可信度高"]', '["互動率較低"]', 'low', 0, 92, '{"reach":"中"}', 2);

  INSERT INTO decisions (id, proposal_id, chosen_option_id, action, decided_by, note, decided_at) VALUES
    (d_taskgo_1, p_taskgo_1, po_taskgo_a, 'approve', u_taskgo_mgr, '採用方案A,立場站在做工的人這邊,導流點工Go。', now() - interval '13 days' + interval '1 hour');

  INSERT INTO campaigns (id, primary_brand_id, decision_id, title, status, start_date, end_date) VALUES
    (camp_taskgo_1, b_taskgo, d_taskgo_1, 'TaskGo 缺工議題借勢檔期', 'completed', (now() - interval '12 days')::date, (now() - interval '3 days')::date);

  INSERT INTO campaign_brands (campaign_id, brand_id) VALUES (camp_taskgo_1, b_taskgo);

  INSERT INTO contents (id, campaign_id, brand_id, brand_version_id, content_type, target_platform, title, status, generated_by_agent_id) VALUES
    (ct_taskgo_1, camp_taskgo_1, b_taskgo, v_taskgo_1, 'article', 'threads', '缺工是國安問題,工地人自己想辦法', 'published', a_content);

  INSERT INTO content_versions (id, content_id, version_number, body, hashtags, cta, generated_by_agent_id, created_at) VALUES
    (cv_taskgo_1_1, ct_taskgo_1, 1, '缺工是國安問題沒人否認,但工地人不能等政策。點工Go上架接案,案子自己找上門。', '["#做工的人","#缺工","#點工"]', '留言 +1,教你怎麼設定。', a_content, now() - interval '12 days');

  INSERT INTO content_reviews (content_id, content_version_id, reviewer_id, action, comment, reviewed_at) VALUES
    (ct_taskgo_1, cv_taskgo_1_1, u_taskgo_mgr, 'approve', '立場精準,核准發布。', now() - interval '11 days');

  INSERT INTO publishing_jobs (id, content_id, content_version_id, platform, status, scheduled_at, published_at, published_by) VALUES
    (pj_taskgo_1, ct_taskgo_1, cv_taskgo_1_1, 'threads', 'published', now() - interval '11 days', now() - interval '11 days', u_taskgo_mgr);

  INSERT INTO performance_reports (publishing_job_id, impressions, clicks, comments, shares, saves, engagement_rate, captured_at) VALUES
    (pj_taskgo_1, 42300, 980, 156, 210, 88, 0.0562, now() - interval '9 days');

  INSERT INTO learning_records (brand_id, brand_version_id, record_type, insight, related_content_id, generated_by_agent_id) VALUES
    (b_taskgo, v_taskgo_1, 'audience_engagement', '產業趨勢蹭熱度型貼文在Threads的留言互動率最高,建議維持每週至少一篇', ct_taskgo_1, a_market);

  -- ==========================================================================
  -- 流程三:Washgo 換季收納(待審閱中,示範 pending 狀態)
  -- ==========================================================================
  INSERT INTO campaigns (id, primary_brand_id, title, status, start_date, end_date) VALUES
    (camp_washgo_1, b_washgo, 'Washgo 換季收納檔期', 'planning', (now())::date, (now() + interval '14 days')::date);

  INSERT INTO campaign_brands (campaign_id, brand_id) VALUES (camp_washgo_1, b_washgo);

  INSERT INTO contents (id, campaign_id, brand_id, brand_version_id, content_type, target_platform, title, status, generated_by_agent_id) VALUES
    (ct_washgo_1, camp_washgo_1, b_washgo, v_washgo_1, 'image', 'instagram', '厚外套收之前,先讓它乾乾淨淨過冬眠', 'pending_review', a_content);

  INSERT INTO content_versions (id, content_id, version_number, body, hashtags, cta, generated_by_agent_id, created_at) VALUES
    (cv_washgo_1_1, ct_washgo_1, 1, '換季收納前,先讓外套洗好曬乾再收起來。到府收送+專業洗護,明年拿出來不再有霉味。', '["#Washgo","#衣物送洗","#換季"]', '加入 @washgo 領取 100 GoCoin', a_content, now() - interval '1 days');

  -- ==========================================================================
  -- Collaboration 的提案(修繕串接週年回顧)
  -- ==========================================================================
  INSERT INTO proposals (id, collaboration_id, meeting_id, title, status, proposed_by_agent_id, created_at) VALUES
    (p_collab_1, collab_1, NULL, 'Homigo × TaskGo 修繕串接週年回顧貼文', 'pending_decision', a_moderator, now() - interval '1 days');

  INSERT INTO proposal_options (id, proposal_id, label, description, pros, cons, risk_level, brand_fit_score, estimated_impact, sort_order) VALUES
    (po_collab_a, p_collab_1, '方案 A', '雙品牌各自發布,分別以房東視角與廠商視角敘事', '["雙邊導流", "強化生態系印象"]', '["需雙方各自審閱,時程需對齊"]', 'low', 91, '{"reach":"中高"}', 1);

  -- ==========================================================================
  -- Activity Logs(對應以上流程的關鍵事件,驅動 Timeline 頁)
  -- ==========================================================================
  INSERT INTO activity_logs (brand_id, actor_type, actor_agent_id, action, entity_type, entity_id, after_state, created_at) VALUES
    (b_homigo, 'ai_agent', a_market, 'market_signal.discovered', 'market_signal', ms_rent_policy, '{"title":"租金補貼加碼政策新聞"}', now() - interval '10 days' - interval '10 min');
  INSERT INTO activity_logs (brand_id, actor_type, actor_agent_id, action, entity_type, entity_id, created_at) VALUES
    (b_homigo, 'ai_agent', a_moderator, 'proposal.created', 'proposal', p_homigo_1, now() - interval '9 days');
  INSERT INTO activity_logs (brand_id, actor_type, actor_user_id, action, entity_type, entity_id, before_state, after_state, created_at) VALUES
    (b_homigo, 'user', u_homigo_mgr, 'decision.approved', 'proposal', p_homigo_1, '{"status":"pending_decision"}', '{"status":"approved"}', now() - interval '9 days' + interval '2 hours'),
    (b_homigo, 'user', u_homigo_mgr, 'content.reviewed', 'content', ct_homigo_1, '{"action":"modify"}', '{"version":1}', now() - interval '6 days' + interval '30 min'),
    (b_homigo, 'user', u_homigo_mgr, 'content.approved', 'content', ct_homigo_1, '{"status":"pending_review"}', '{"status":"approved"}', now() - interval '5 days');
  INSERT INTO activity_logs (brand_id, actor_type, actor_user_id, action, entity_type, entity_id, created_at) VALUES
    (b_homigo, 'user', u_homigo_mgr, 'publishing.published', 'publishing_job', pj_homigo_1, now() - interval '5 days');
  INSERT INTO activity_logs (brand_id, actor_type, actor_agent_id, action, entity_type, entity_id, created_at) VALUES
    (b_taskgo, 'ai_agent', a_market, 'proposal.created', 'proposal', p_taskgo_1, now() - interval '13 days');
  INSERT INTO activity_logs (brand_id, actor_type, actor_user_id, action, entity_type, entity_id, created_at) VALUES
    (b_taskgo, 'user', u_taskgo_mgr, 'decision.approved', 'proposal', p_taskgo_1, now() - interval '13 days' + interval '1 hour'),
    (b_taskgo, 'user', u_taskgo_mgr, 'publishing.published', 'publishing_job', pj_taskgo_1, now() - interval '11 days');
  INSERT INTO activity_logs (brand_id, actor_type, actor_agent_id, action, entity_type, entity_id, created_at) VALUES
    (b_washgo, 'ai_agent', a_content, 'content.generated', 'content', ct_washgo_1, now() - interval '1 days');
  INSERT INTO activity_logs (collaboration_id, actor_type, actor_agent_id, action, entity_type, entity_id, created_at) VALUES
    (collab_1, 'ai_agent', a_moderator, 'proposal.created', 'proposal', p_collab_1, now() - interval '1 days' + interval '2 hours');
  INSERT INTO activity_logs (brand_id, actor_type, actor_user_id, action, entity_type, entity_id, created_at) VALUES
    (b_homigo, 'user', u_homigo_mgr, 'brand_version.published', 'brand_version', v_homigo_1, now() - interval '20 days'),
    (b_taskgo, 'user', u_taskgo_mgr, 'brand_version.published', 'brand_version', v_taskgo_1, now() - interval '18 days'),
    (b_washgo, 'user', u_washgo_mgr, 'brand_version.published', 'brand_version', v_washgo_1, now() - interval '15 days');

END $$;

COMMIT;
