-- ============================================================================
-- Migration 010: Go 生態系 Brief 內容擴充(v2)
--   來源:使用者提供的四份內部簡報(Digital Backbone 下載版/桌面版、Digital Nexus、
--   Smart Management),經逐頁人工審閱後,只納入「產業總體統計數字、產品功能敘事、
--   架構/技術敘事、自動化情境故事、未來願景」等可公開項目;
--   已知悉四份簡報中出現的下列敏感資訊,一律未寫入本 Brief、也不得由 AI 自行推論補上:
--     - 具體付費客戶數量(如「已上線客戶 10 家」)、客戶財務輪廓
--     - ARPU、CAC、LTV、LTV:CAC、月流失率、毛利率等單位經濟指標
--     - 逐年 ARR/營收財務預測
--     - 募資金額、投前估值、釋股比例、資金分配用途
--     - 具體定價金額與抽成費率(Homigo PRO 方案定價、WashGo 階梯抽成等)
--     - SAM/SOM 等公司自訂的市場滲透假設(僅保留 TAM 產業總體統計數字)
--   本次新增第二版 Brief(version_number 遞增),舊版本保留供追溯,程式讀取邏輯
--   (buildCollaborationContext)只取最新版本,故新版需完整涵蓋舊版內容,不能只寫增量。
-- ----------------------------------------------------------------------------
-- 可安全重複執行(idempotent)。
-- 執行方式: psql "$DATABASE_URL" -f db/migrations/010_ecosystem_brief_enrichment.sql
-- ============================================================================

DO $$
DECLARE
  collab_eco UUID;
  next_version INTEGER;
  u_admin UUID;
BEGIN
  SELECT id INTO collab_eco FROM collaborations WHERE title = 'Go 生態系(Homigo × TaskGo × Washgo)' LIMIT 1;
  SELECT id INTO u_admin FROM users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1;

  IF collab_eco IS NULL THEN
    RAISE NOTICE '[010] 找不到 Go 生態系 Collaboration,略過(請先執行 008 migration)';
    RETURN;
  END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM collaboration_briefs WHERE collaboration_id = collab_eco;

  IF EXISTS (
    SELECT 1 FROM collaboration_briefs
    WHERE collaboration_id = collab_eco AND title = 'Go 生態系總覽 Brief v2(簡報素材擴充)'
  ) THEN
    RAISE NOTICE '[010] Go 生態系 Brief v2 已存在,略過建立';
    RETURN;
  END IF;

  INSERT INTO collaboration_briefs (collaboration_id, title, content_markdown, version_number, created_by)
  VALUES (
    collab_eco,
    'Go 生態系總覽 Brief v2(簡報素材擴充)',
    $brief$# Go 生態系總覽(唯一可跨品牌引用的事實來源 — v2)

## 生態系關係圖

- **Homigo**(房屋/包租代管):產生報修需求,是生態系的需求入口
- **TaskGo**(工程/派工):承接修繕供給,完成派工與施工
- **Washgo**(洗衣/生活服務):補足租屋生活的洗衣收送等加值服務
- **GoCoin**:三品牌共用點數,1 點 = NT$1,永久不過期(依 Washgo 品牌事實,可全生態系引用)

## 現況聲明

- Homigo × TaskGo 修繕串接:已上線(依 Homigo 市場調查,為包租代管軟體首創),詳細事實以既有「Homigo × TaskGo 修繕生態合作」Brief 為準
- Washgo:已正式上線,可在任何品牌的內容中提及作為租屋生活加值服務
- TaskGo、Homigo、Washgo 三條產品線均已完成生產環境部署上線,可對外提及「已上線/已在生產環境運行」,但**不得**附加任何具體客戶數、營收或財務狀態的措辭

## 各品牌可對外提及彼此的「公開安全事實」

僅限下列項目,不可引用對方內部數據、受眾清單、規則細節或未公開資訊:

- Homigo 可提及:TaskGo 修繕串接已上線;Washgo 洗衣收送可作為租屋加值服務入口
- TaskGo 可提及:透過 Homigo 房東/包租代管業者取得修繕案源,案源更穩定
- Washgo 可提及:可透過 Homigo 生態系接觸租屋族客群;GoCoin 跨品牌通用可折抵

## 貼文角度授權(發布前仍需各自品牌負責人核准,AI 不可自行發布)

- **Homigo → 房東 / 包租代管業者 TA**:「房客報修直通 TaskGo 認證師傅」「租屋加值服務含 Washgo 洗衣收送」
- **TaskGo → 工程行 / 師傅 TA**:「透過 Homigo 串接取得的房東案源,接案更穩定」
- **Washgo → 租屋族 / 上班族 TA**:「透過 Homigo 生態系認識 Washgo」「GoCoin 跨品牌通用」
- **Go 生態系 X 帳號**:除了三品牌一起講的生態系敘事,也授權「單品牌聚焦」貼文(明確點名 TaskGo 或 Homigo 或 Washgo 其中一個,只用該品牌下方專屬事實區塊的內容,不必每篇都硬拉另外兩個品牌進來)

---

## 國際化素材庫(供 Go 生態系 X 帳號使用;全英文獨立人格,不代表任何單一品牌翻譯)

核心敘事:一個從台灣長出來、正在打入國際市場的垂直 SaaS 生態系——需求端(Homigo)驅動供給端(TaskGo),並用生活服務(Washgo)補齊使用情境,形成一個 PropTech/FieldService/Lifestyle 三層垂直整合的操作系統。

**禁止事項**:不可捏造三品牌合併後的整體數字(例如「生態系共 X 萬用戶」)、不可提及任何具體付費客戶數量、營收金額、ARR、募資/估值/股權資訊、定價金額與抽成費率、CAC/LTV/流失率/毛利率等單位經濟指標、SAM/SOM 等內部市場滲透假設——上述類別即使原始簡報中出現具體數字,也一律不寫入本 Brief,AI 不得自行推論或估算補上。不可宣稱市佔率第一或未經證實的最高級用語。

### A. 已核准的既有事實點

- TaskGo: 500+ teams already using the platform; dispatch time reduced by 70%.
- Homigo: LINE-native property management (no app download required); first-to-market repair integration for rental-management software in Taiwan, per Homigo's own market research.
- Washgo: cross-brand loyalty currency (GoCoin), 1 GoCoin = NT$1, never expires.

### B. 產業痛點敘事(Industry Pain Points)

- Construction/renovation dispatch today runs on scrolling through LINE group chats for progress updates, with quotes and invoices easy to lose track of — managers spend their day chasing progress instead of managing it.
- Rental/property management still runs on paper ledgers for rent collection, with no record of repair handoffs — a gap that fuels disputes and turns management into a high-burnout, always-on job.
- Laundry chains still rely on handwritten tickets, unintegrated single-terminal POS systems, and no systematic delivery sign-off — leaving quality disputes hard to trace and no usable member data.
- Across all three industries the root pain is the same: fragmented information, revenue leakage, staff turnover, and no data to optimize against.
- Traditional tools — ERP, CRM, work-order systems, rental software — operate as disconnected silos with zero interoperability.

### C. Go 生態系核心架構敘事(One Engine, Three Verticals)

- One core engine powering three trillion-NT-dollar-scale industries: TaskGo (construction), Homigo (rental housing), WashGo (laundry) — not three separate SaaS apps, but one interconnected intelligent ecosystem.
- All three products share one central platform: LINE integration, an AI engine, the GoCoin points/payment layer, subscription billing, and smart dispatch scheduling.
- The real reason digital transformation fails isn't weak software — it's user friction. Our answer: if you can run LINE, you can run it. Zero learning curve, zero app download, zero password setup.
- Technical moat: 70%+ of the enterprise-grade cloud architecture (LINE-native frontend, Cloudflare Workers/Hono edge layer, Workers AI + RAG intelligence layer, PostgreSQL/Redis data layer) is shared across all three verticals — every new vertical reuses 70%+ of the existing stack, with 100+ shared technical modules already in production.
- A single AI engine powers multiple recognition scenarios across verticals (care-label recognition, utility-meter reading, building-material identification) — data from all three verticals continuously feeds back to make the models sharper over time (a self-reinforcing data flywheel).
- "Everything can be Go-ified": the open, highly extensible architecture lets any business managing people, space, equipment, work, service, or workflow plug in via Open API.

### D. 各品牌專屬事實(供「單品牌聚焦」貼文使用 — 每個品牌只用自己的區塊,不強行帶其他品牌)

**TaskGo(construction / field-service dispatch management)**
- Connects two views seamlessly: a "God's-eye" PM dashboard with a visual dispatch calendar, AI-driven crew matching, and real-time cost-vs-budget tracking — and a zero-friction crew-side flow with one-tap LINE GPS check-in, voice input, AI material recognition, and instant on-site photo reporting.
- AI matches the best-fit crew for a job, learns from historical project-timeline data, forecasts project cost, flags safety anomalies, and generates billing reports with one click.
- Core modules: project management, crew dispatch/scheduling, on-site execution, attendance & payroll, and cost reporting — monetized via modular subscription tiers.
- Result: zero information lag between the field and the back office.

**Homigo(LINE-native rental / property management)**
- A central hub connecting listing, lease, maintenance, equipment, finance, and notification management for landlords, agents, and tenants — the entire workflow (listing, e-signing, rent collection, repair requests, move-out handovers) runs natively on LINE with no app download.
- AI reads utility meters and receipts automatically, cutting the manual work of rent/bill reconciliation; AI also drafts listing copy and suggests optimal renewal timing.
- The HomiScore credit-rating and badge system gamifies good tenant behavior, reinforcing landlord-tenant trust.
- Strong network effects: landlords bring their own tenants onto the platform, and agents bring in landlords — driving organic, viral user growth.

**Washgo(smart laundry / garment-care platform)**
- A multi-brand laundry-chain SaaS unifying payments, logistics, and information flow into one system — tracking 25+ status checkpoints from one-click ordering through smart routing, AI photo documentation, quality control, and digital settlement.
- AI-powered intake automatically identifies fabric type, soil level, and care labels (Care Label) to generate an instant quote, replacing manual paperwork entirely.
- Powers GoCoin, the cross-brand loyalty currency shared across the entire Go Ecosystem (1 GoCoin = NT$1, never expires).
- Customer journey is zero-download, zero-paperwork, zero-barrier from onboarding through delivery tracking.

### E. 跨品牌自動化情境故事(適合 Thread 敘事,已發生的系統能力,非未來願景)

- Repair-request domino effect: a tenant reports an issue over LINE to Homigo → the system auto-dispatches a partner crew via TaskGo → the crew navigates on-site, completes the work, and uploads photos → Homigo auto-updates the record and notifies the tenant. Zero manual handoff, zero lag across two different industries.
- Move-out/turnover orchestration: what used to take five phone calls to coordinate is now fully automated — a move-out event in Homigo triggers cleaning dispatch in TaskGo and linen pickup/laundering in Washgo, then the unit is auto-relisted.
- Short-term rental / Airbnb-style turnover: guest checks out → TaskGo auto-schedules cleaning → Washgo triggers pickup/delivery of linens and curtains → Homigo auto-updates room status and relists once done — a loop that runs continuously.
- AI Agent proactive execution: a simple tenant message like "the AC is broken and keeps dripping" is enough for the AI to detect urgency via semantic understanding, auto-generate a work order, schedule with the tenant, track completion photos, and send a satisfaction survey — no human touch required in the loop.

### F. 市場規模 / TAM 數字(產業總體市場統計,非公司自身業績)

- Combined total addressable market (TAM) across construction/renovation, rental housing, and laundry services in Taiwan exceeds NT$560 billion (~US$18B).
- Construction/renovation industry TAM: NT$550B+.
- Taiwan's rental population exceeds 3 million people; the government-backed rental/property-management policy targets surpassing 250,000 managed units.
- Laundry industry market size in Taiwan: NT$12.3B.

### G. 效率提升敘事(依原始簡報標註「目標」或「已實現」,發文時保留這個語境,不要拿掉限定詞)

- Reused technical infrastructure across verticals: 70%+ of the platform's shared architecture is already in production across all three products (realized, not a target).
- TaskGo claims up to a 70% reduction in administrative burden compared to paper-based or generic-app workflows (a product design/marketing claim; frame with "designed to" or "up to" rather than as an audited outcome).
- Managers using TaskGo report a 60%+ efficiency gain from no longer having to chase LINE messages or manually compile spreadsheets (as stated in source material; frame conservatively, avoid implying third-party verification).

### H. 未來願景 / 擴張藍圖

- "Everything can be Go-ified": beyond the inner ring of TaskGo/Homigo/Washgo, the roadmap plans an outer ring expanding into FacilityGo, OfficeGo, HotelGo, StoreGo, CareGo, and LogisticsGo — any business managing people, space, equipment, work, services, or workflows can plug into the shared architecture.
- Roadmap: near-term (0–12 months) — deepen monetization and expand pilots across all three verticals, fully activate the cross-vertical GoCoin points economy; mid-term (12–24 months) — open the platform to external API integrations, introduce value-added financial services; long-term (24+ months) — become Taiwan's standard "digital operating system" for traditional service industries and expand into similar markets across Asia.
- Go-to-market approach: land deeply in one vertical, replicate the module, then scale — partnering with industry associations and LINE Official Account distribution to reach traditional service businesses.
- Vision statement: "We're not building three separate SaaS products. From work to housing to daily life, we believe the future of management isn't more systems — it's one truly interconnected intelligent ecosystem."

### I. 技術特色與可公開的信任背書

- Tech stack: Next.js frontend + LINE LIFF, Cloudflare Workers & Hono at the edge with Durable Objects for real-time sync, Workers AI with retrieval-augmented generation (RAG) for the intelligence layer, PostgreSQL/Redis for data.
- AI visual-recognition use cases span care-label reading, utility-meter interpretation, and building-material identification — all powered by a shared AI engine that gets sharper as more verticals feed it data.
- The technology has received Taiwan's SBIR (government) innovation R&D certification and runs on Google Cloud infrastructure with bank-grade security practices, targeting high service availability. (Public, verifiable credential — double-check exact wording and brand-usage rules before quoting "Google Cloud" by name in any single post.)
$brief$,
    next_version, u_admin
  );

  RAISE NOTICE '[010] 已建立 Go 生態系 Brief v2(version_number=%),collaboration_id=%', next_version, collab_eco;
END $$;
