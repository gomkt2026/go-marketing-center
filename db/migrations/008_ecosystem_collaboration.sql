-- ============================================================================
-- Migration 008: Go 生態系 Collaboration Workspace
--   1. 修正 TaskGo 舊有「Washgo 未上線」的過期規則(用新規則取代,不刪除以保留可追溯性)
--   2. 建立三品牌(Homigo × TaskGo × Washgo)共用的 Collaboration Workspace + Brief
--      作為之後所有跨品牌導流內容(房東 TA 看見 TaskGo 修繕/Washgo 洗衣等)與 Go 生態系
--      X(Twitter) 帳號的唯一可引用事實來源(Principle 3:合作需許可,不可互讀對方完整知識庫)
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/008_ecosystem_collaboration.sql
-- ============================================================================

DO $$
DECLARE
  b_homigo   UUID;
  b_taskgo   UUID;
  b_washgo   UUID;
  u_admin    UUID;
  collab_eco UUID;
BEGIN
  SELECT id INTO b_homigo FROM brands WHERE slug = 'homigo' LIMIT 1;
  SELECT id INTO b_taskgo FROM brands WHERE slug = 'taskgo' LIMIT 1;
  SELECT id INTO b_washgo FROM brands WHERE slug = 'washgo' LIMIT 1;
  SELECT id INTO u_admin FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1;

  IF b_homigo IS NULL OR b_taskgo IS NULL OR b_washgo IS NULL THEN
    RAISE NOTICE '[008] 找不到 homigo/taskgo/washgo 三品牌,略過(請先執行 db/seed.sql)';
    RETURN;
  END IF;

  -- ==========================================================================
  -- 1. 修正資料矛盾:TaskGo 舊的 negative_rule「Washgo 未上線前不得生成貼文」已過期
  --    (Washgo 品牌聖經本身已是完整上線狀態);標記取代,不刪除(Principle 7 可追溯)
  -- ==========================================================================
  UPDATE brand_rules
  SET condition_note = trim(COALESCE(condition_note, '') || E'\n[2026 更新:已取代] Washgo 已正式上線,現以「Go 生態系」Collaboration Brief 為唯一跨品牌事實來源,本條規則不再適用。')
  WHERE brand_id = b_taskgo
    AND rule_type = 'negative_rule'
    AND statement LIKE 'Washgo 未上線前%'
    AND COALESCE(condition_note, '') NOT LIKE '%已取代%';

  IF NOT EXISTS (
    SELECT 1 FROM brand_rules
    WHERE brand_id = b_taskgo
      AND statement = 'Washgo 已正式上線,跨品牌合作內容以「Go 生態系」Collaboration Brief 為唯一事實來源'
  ) THEN
    INSERT INTO brand_rules (brand_id, rule_type, statement, condition_note, verification, sort_order)
    VALUES (
      b_taskgo, 'marketing_rule',
      'Washgo 已正式上線,跨品牌合作內容以「Go 生態系」Collaboration Brief 為唯一事實來源',
      '取代舊有「Washgo 未上線前不得生成貼文」的負面表列規則',
      'verified', 6
    );
  END IF;

  -- ==========================================================================
  -- 2. 建立 Go 生態系 Collaboration(若已存在則跳過,不重複建立)
  -- ==========================================================================
  SELECT id INTO collab_eco FROM collaborations WHERE title = 'Go 生態系(Homigo × TaskGo × Washgo)' LIMIT 1;

  IF collab_eco IS NULL THEN
    collab_eco := gen_random_uuid();

    INSERT INTO collaborations (id, title, description, status, created_by) VALUES (
      collab_eco,
      'Go 生態系(Homigo × TaskGo × Washgo)',
      '三品牌共用的生態系敘事工作區:用於跨品牌導流內容(如 Homigo 房東/包租代管業者 TA 看見 TaskGo 修繕、Washgo 洗衣服務)以及共用的 Go 生態系 X(Twitter) 國際發文帳號。不取代 Homigo × TaskGo 修繕生態合作既有的 Brief,而是更高層級的三品牌生態系總覽。',
      'active', u_admin
    );

    INSERT INTO collaboration_brands (collaboration_id, brand_id) VALUES
      (collab_eco, b_homigo),
      (collab_eco, b_taskgo),
      (collab_eco, b_washgo);

    INSERT INTO collaboration_briefs (collaboration_id, title, content_markdown, version_number, created_by)
    VALUES (
      collab_eco,
      'Go 生態系總覽 Brief',
      $brief$# Go 生態系總覽(唯一可跨品牌引用的事實來源)

## 生態系關係圖

- **Homigo**(房屋/包租代管):產生報修需求,是生態系的需求入口
- **TaskGo**(工程/派工):承接修繕供給,完成派工與施工
- **Washgo**(洗衣/生活服務):補足租屋生活的洗衣收送等加值服務
- **GoCoin**:三品牌共用點數,1 點 = NT$1,永久不過期(依 Washgo 品牌事實,可全生態系引用)

## 現況聲明(取代舊有互相矛盾的敘述)

- Homigo × TaskGo 修繕串接:已上線(依 Homigo 市場調查,為包租代管軟體首創),詳細事實以既有「Homigo × TaskGo 修繕生態合作」Brief 為準
- Washgo:已正式上線,可在任何品牌的內容中提及作為租屋生活加值服務;先前 TaskGo 品牌規則中「Washgo 未上線」的敘述已作廢

## 各品牌可對外提及彼此的「公開安全事實」

僅限下列項目,不可引用對方內部數據、受眾清單、規則細節或未公開資訊:

- Homigo 可提及:TaskGo 修繕串接已上線;Washgo 洗衣收送可作為租屋加值服務入口
- TaskGo 可提及:透過 Homigo 房東/包租代管業者取得修繕案源,案源更穩定
- Washgo 可提及:可透過 Homigo 生態系接觸租屋族客群;GoCoin 跨品牌通用可折抵

## 貼文角度授權(發布前仍需各自品牌負責人核准,AI 不可自行發布)

- **Homigo → 房東 / 包租代管業者 TA**:「房客報修直通 TaskGo 認證師傅」「租屋加值服務含 Washgo 洗衣收送」
- **TaskGo → 工程行 / 師傅 TA**:「透過 Homigo 串接取得的房東案源,接案更穩定」
- **Washgo → 租屋族 / 上班族 TA**:「透過 Homigo 生態系認識 Washgo」「GoCoin 跨品牌通用」

## 國際化敘事(供 Go 生態系 X 帳號使用;全英文獨立人格,不代表任何單一品牌翻譯)

- 核心敘事:一個從台灣長出來、正在打入國際市場的垂直 SaaS 生態系——需求端(Homigo)驅動供給端(TaskGo),並用生活服務(Washgo)補齊使用情境,形成一個 PropTech/FieldService/Lifestyle 三層垂直整合的操作系統。
- 可公開引用的英文事實點(僅限以下,不可自行延伸或誇大):
  - TaskGo: 500+ teams already using the platform; dispatch time reduced by 70%.
  - Homigo: LINE-native property management (no app download required); first-to-market repair integration for rental-management software in Taiwan, per Homigo's own market research.
  - Washgo: cross-brand loyalty currency (GoCoin), 1 GoCoin = NT$1, never expires.
- 禁止事項:不可捏造三品牌合併後的整體數字(例如「生態系共 X 萬用戶」),除非管理者事後提供官方合併數據;不可宣稱市佔率第一或未經證實的最高級用語。
$brief$,
      1, u_admin
    );

    RAISE NOTICE '[008] 已建立 Go 生態系 Collaboration Workspace (id=%)', collab_eco;
  ELSE
    RAISE NOTICE '[008] Go 生態系 Collaboration 已存在,略過建立';
  END IF;
END $$;
