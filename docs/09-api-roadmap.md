# 09. 未來 API 擴充缺口

V1 為資料庫 Schema + Domain Model + 前端骨架（假資料驅動），刻意不串接任何外部 API。本文件列出未來需要補上的整合缺口，供後續階段規劃。

## 模組化原則

Brand Intelligence / Market Intelligence / AI Meeting / Campaign / Content / Publishing / Analytics / Learning 八大模組完全解耦，模組間僅透過 ID 引用與 `activity_logs` 溝通。新增任何 API 整合都應該是「在某個模組內新增一個 Provider」，而不需要改動其他模組。

```mermaid
flowchart LR
    subgraph core [核心模組(已定義資料模型)]
        BI[Brand Intelligence]
        MI[Market Intelligence]
        MT[AI Meeting]
        CP[Campaign]
        CT[Content]
        PB[Publishing]
        AN[Analytics]
        LN[Learning]
    end
    subgraph future [未來可插入的 Agent 模組]
        Video[Video AI]
        Voice[Voice AI]
        CS[Customer Service AI]
        Sales[Sales AI]
    end
    future -. 透過 ai_agents + agent_permissions 掛載 .-> core
```

## 各模組 API 缺口

### Brand Intelligence

- Onboarding AI 素材解析：官網爬取、PDF/簡報文字擷取、圖片 OCR、影片轉字幕
- LLM 品牌定位生成與 Confidence 評分
- 品牌知識異動偵測（定期掃描官網變化，產出「建議修改」提案）

### Market Intelligence

- 新聞/RSS 來源整合（政策、產業趨勢）
- 社群聆聽 API（話題熱度、關鍵字監測）
- Evergreen 內容選題演算法（避免重複的去重機制）

### AI Meeting Room

- LLM 多角色對話引擎（每個 `ai_agents` 對應獨立 System Prompt + 人格設定）
- 即時串流訊息（WebSocket/SSE），會議進行中即時顯示 AI 逐字生成
- 會議摘要與提案自動生成的 LLM Pipeline

### Campaign / Content

- 文字生成（文章、Hashtag、CTA、SEO metadata）
- 從已核准 `press_coverages`／定稿 `press_releases` 生成 SEO 長文（寫入 `contents.article` + `content_versions.seo_meta`；不自動上架官網）
- 圖片生成 API
- 影片腳本/Prompt 生成
- 內容規則檢查器（依 `brand_rules` 自動檢查生成內容是否違反事實邊界）

### Press / Earned Media

- `press_coverages`：第三方露出知識庫（標題／出處／摘要／短金句；不存全文）
- `POST /api/brands/:slug/press-coverages/parse`：抓原文連結的 OG／JSON-LD／有限摘錄，回傳可編輯預覽（不寫庫、不存全文）
- `POST /api/brands/:slug/press-coverages/discover`：從 Google News + 台灣媒體 RSS 撈品牌名相關報導，只回候選清單
- `POST /api/brands/:slug/press-coverages/convert`：把解析結果或連結轉換寫入 `press_coverages`
- `press_releases`：自家新聞稿內部審稿（草稿 → 送審 → 核准 → 定稿）
- Scheduler 品牌名監測寫入 inbox，人工核准後才可被 `buildBrandContext` 引用

### Publishing

- Instagram Graph API
- Facebook Graph API
- Threads API
- LINE Messaging API（LINE OA）
- 未來：TikTok API、YouTube Data API、LinkedIn API
- 統一的排程發布 Worker（讀取 `publishing_jobs` 依 `scheduled_at` 執行）

### Analytics

- 各平台洞察 API（IG/FB Insights、Threads Insights、LINE OA Insights）
- 定期成效回收 Worker，寫入 `performance_reports`

### Learning

- 成效歸因分析（哪些 CTA/內容支柱/受眾表現最好）
- 自動產生 `learning_records` 的分析 Pipeline

### 未來 Agent 模組（V2+）

| 模組 | 說明 | 掛載方式 |
|---|---|---|
| Video AI | 影片腳本轉實際影片生成 | 新增 `agent_roles` + 對應 `content_type` |
| Voice AI | 語音內容/播客生成 | 新增 `content_type = 'audio'` |
| Customer Service AI | 顧客服務自動回覆建議 | 新增獨立模組，透過 `agent_permissions` 讀取 Brand Knowledge |
| Sales AI | 銷售線索分析與建議 | 獨立模組，僅讀取權限，不接觸內容生成 |

## 整合順序建議（非本次範圍，僅供規劃參考）

1. Publishing（LINE OA、Facebook、Instagram）— 因為三個品牌現有素材已高度依賴 LINE
2. Content Generation（文字生成 + 規則檢查器）
3. Market Intelligence（新聞/趨勢來源）
4. AI Meeting Room（多角色 LLM 對話）
5. Analytics（成效回收）
6. Onboarding AI（自動化程度最高，可最後導入）
