# 03. 資料庫架構說明

完整 DDL 見 [db/schema.sql](../db/schema.sql)；種子資料見 [db/seed.sql](../db/seed.sql)。本文件說明設計原則、隔離策略與各表用途。

## 設計慣例

- 主鍵一律 `UUID DEFAULT gen_random_uuid()`
- 所有表皆有 `created_at`；會被編輯的表另有 `updated_at`（由 `set_updated_at()` trigger 自動維護）
- 狀態欄一律使用 PostgreSQL ENUM，而非自由字串，確保狀態機合法性
- 半結構化/彈性資料使用 `JSONB`（例如 proposal 的 `estimated_impact`、`pros`/`cons`）
- 外鍵預設 `ON DELETE RESTRICT`；僅明細/子表（如 `content_versions`、`meeting_messages`）使用 `ON DELETE CASCADE`
- Email/Slug 等不分大小寫欄位使用 `CITEXT`

## 品牌隔離策略（Principle 1 / 2 的資料庫落實）

- 幾乎所有業務表都有 `brand_id NOT NULL REFERENCES brands(id)`：`brand_versions`、`brand_documents`、`market_signals`、`campaigns`、`contents`、`learning_records` 等
- 跨品牌實體（`meetings`、`proposals`、`campaigns`）允許 `brand_id` 或 `collaboration_id` 擇一，並以 `CHECK` 約束強制至少要有一個範圍歸屬——不存在「無歸屬」的資料
- AI 存取權限透過 `agent_permissions(agent_id, brand_id, scope)` 明確授權；`ai_agents.brand_id` 為 NULL 表示跨品牌通用角色（如 Market Analyst），但實際存取仍須經 `agent_permissions` 逐一授權特定品牌

## 版本化策略

`brand_versions` 是品牌知識的版本容器：

- 狀態機：`draft → published → archived`
- 所有品牌知識子表（`brand_rules`、`brand_audiences`、`brand_personas`…）皆帶 `brand_version_id`，可精準查詢「某個版本當時的品牌樣貌」
- `brands.current_version_id` 永遠指向目前生效的 `published` 版本
- 發布時，系統將該版本所有結構化條目編譯成 `brand_versions.compiled_markdown`（唯讀快照），對應 [08-brand-markdown-spec.md](08-brand-markdown-spec.md)

## 資料表分組總覽

### 身分與 AI 權限

| 表 | 用途 |
|---|---|
| `users` | 系統使用者（管理者、品牌負責人、編輯、唯讀） |
| `brand_members` | 使用者與品牌的多對多關係與角色 |
| `agent_roles` | AI 角色定義（品牌 AI、Market Analyst、Risk Advisor…） |
| `ai_agents` | AI 角色的具體實例，可綁定特定品牌或跨品牌通用 |
| `agent_permissions` | Agent 對特定品牌的存取範圍授權（讀知識/讀市場情報/建立提案…） |

### Brand Intelligence

| 表 | 用途 |
|---|---|
| `brands` | 品牌根實體 |
| `brand_versions` | 品牌知識版本容器 |
| `brand_documents` | Onboarding 上傳的原始資料（官網、簡報、PDF…），永久保留 |
| `brand_assets` | Logo、圖片、影片、色票、字型等資產 |
| `brand_audiences` | 目標受眾區隔 |
| `brand_personas` | 細分 Persona（如 P1~P6） |
| `brand_rules` | 事實邊界、禁止事項、行銷規則、核准數據 |
| `brand_visuals` | 視覺規範（色票、圖卡尺寸） |
| `brand_channels` | 各社群平台的調性設定 |
| `brand_keywords` | Hashtag / CTA / 關鍵訊息庫 |
| `brand_histories` | 品牌里程碑 |
| `brand_examples` | 內容支柱、敘事素材、熱點主題庫 |

### Market Intelligence

| 表 | 用途 |
|---|---|
| `market_signals` | AI 每日蒐集的新聞/政策/趨勢/話題，含 Evergreen 類型 fallback |

### Collaboration

| 表 | 用途 |
|---|---|
| `collaborations` | 品牌合作案 |
| `collaboration_brands` | 參與合作的品牌清單 |
| `collaboration_briefs` | AI 唯一可讀的合作簡報（非完整品牌資料） |

### AI Meeting Room

| 表 | 用途 |
|---|---|
| `meetings` | 會議（可綁定品牌或合作案） |
| `meeting_participants` | 參與者（人或 AI） |
| `meeting_messages` | 討論串訊息 |
| `meeting_summaries` | AI 產出的會議摘要 |

### Decision Center

| 表 | 用途 |
|---|---|
| `proposals` | AI 產出的提案（狀態機：待決策/已批准/已否決/需修改/已撤回） |
| `proposal_options` | 方案 A/B/C，含優缺點、風險、成本、品牌符合度、預估成效 |
| `decisions` | 管理者的最終決策，唯一可寫入者為 `users` |

### Campaign / Content

| 表 | 用途 |
|---|---|
| `campaigns` | 行銷活動（可單品牌或多品牌） |
| `campaign_brands` | 多品牌活動的參與品牌 |
| `contents` | 內容主體，鎖定生成當下的 `brand_version_id` |
| `content_versions` | 每次生成/修改的版本快照 |
| `content_assets` | 內容對應的圖片/影片檔案 |
| `content_reviews` | 管理者審閱紀錄（批准/修改/退回/重新生成/延期/否決） |

### Publishing / Analytics

| 表 | 用途 |
|---|---|
| `publishing_jobs` | 發布工作(時間、平台、版本、發布人) |
| `publishing_logs` | 發布過程事件記錄 |
| `performance_reports` | 曝光/點擊/留言/分享/收藏/互動率 |

### Learning / Timeline

| 表 | 用途 |
|---|---|
| `learning_records` | 持續學習觀察(不可修改 Brand Core) |
| `activity_logs` | 全域事件流，記錄 actor/action/entity/前後狀態 |

## 索引設計原則

- 所有 `brand_id` 外鍵欄位皆建立索引，因為幾乎所有查詢都以品牌為起點過濾
- 狀態欄與 `brand_id` 建立複合索引（如 `idx_contents_brand ON contents(brand_id, status)`），對應「待審閱清單」「待決策清單」等高頻查詢
- `activity_logs` 依 `created_at DESC` 建索引以支援時間軸分頁查詢
- 唯一約束用於防止重複資料（如 `brand_versions(brand_id, version_number)`、`campaign_brands(campaign_id, brand_id)`）

## 執行方式

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
```
