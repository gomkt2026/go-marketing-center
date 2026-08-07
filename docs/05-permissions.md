# 05. 權限架構

## 人類角色（`users.role`）

| 角色 | 說明 | 可視範圍 | 可決策 |
|---|---|---|---|
| `super_admin` | 集團管理者 | 所有品牌 | 是,含跨品牌合作 |
| `brand_manager` | 品牌負責人 | 所屬品牌(`brand_members`) | 是,限所屬品牌 |
| `brand_editor` | 品牌內容編輯 | 所屬品牌 | 否,可操作草稿/提交審閱,不可最終批准 |
| `viewer` | 唯讀 | 依授權 | 否 |

品牌與使用者為多對多關係，透過 `brand_members(brand_id, user_id, role)` 表達；同一人可在不同品牌擔任不同角色（例如集團行銷同時是 Homigo 的 `brand_manager` 又是 Washgo 的 `viewer`）。

## AI Agent 權限模型

AI 的能力與存取範圍由三層構成：

1. **`agent_roles`**：定義 Agent 的「職能」（品牌 AI、Market Analyst、Content Strategist、Risk Advisor、Devil's Advocate、Moderator），不含品牌別
2. **`ai_agents`**：職能的具體實例。`brand_id` 為 NULL 表示跨品牌通用角色（如 Market Analyst 可服務多品牌，但每次執行仍限定單一品牌 context）；非 NULL 表示專屬於該品牌（如 Homigo AI）
3. **`agent_permissions`**：逐一授權 Agent 對特定品牌的存取範圍（`scope`）

### 權限範圍（`agent_permission_scope`）

| Scope | 說明 |
|---|---|
| `read_brand_knowledge` | 可讀取指定品牌的 Brand Knowledge |
| `read_market_signal` | 可讀取市場情報 |
| `participate_meeting` | 可加入該品牌的 AI 會議 |
| `create_proposal` | 可建立提案(僅能建立,不能批准) |
| `generate_content` | 可生成內容草稿 |
| `read_collaboration_brief` | 可讀取合作簡報(而非完整品牌資料) |

### 鐵律

- 任何 AI Task 執行前必須先確認 `brand_id`；沒有 `brand_id` 一律拒絕執行（對應 Principle 2）
- AI 沒有、也不會被授予寫入 `decisions`、`brand_versions.status = published`、`publishing_jobs` 的權限——這些操作在應用層與資料庫層都只接受 `users` 的 `actor_id`
- 品牌專屬 Agent（如 Homigo AI）不會被授予其他品牌的 `read_brand_knowledge`；如需跨品牌協作，走 Collaboration 架構取得 `read_collaboration_brief`

## 決策權限矩陣

| 動作 | AI | brand_editor | brand_manager | super_admin |
|---|---|---|---|---|
| 建立提案 Proposal | ✅ | — | — | — |
| 批准/否決 Decision | ❌ | ❌ | ✅(自己品牌) | ✅ |
| 生成內容草稿 | ✅ | — | — | — |
| 提交內容審閱 | ❌ | ✅ | ✅ | ✅ |
| 批准/退回內容 Final Review | ❌ | ❌ | ✅(自己品牌) | ✅ |
| 建立發布工作 | ❌(僅系統於批准後建立) | ❌ | ✅ | ✅ |
| 執行發布 | ❌ | ❌ | ✅ | ✅ |
| 編輯品牌知識草稿 | ❌(僅能提案修改) | ✅ | ✅ | ✅ |
| 發布品牌新版本 | ❌ | ❌ | ✅(自己品牌) | ✅ |
| 建立 Collaboration | ❌ | ❌ | ✅ | ✅ |
| 管理 AI Agents / 權限 | ❌ | ❌ | ❌ | ✅ |

## 稽核

所有上表的「✅」動作，執行後都必須寫入一筆 `activity_logs`，記錄 `actor_type`、`actor_user_id`/`actor_agent_id`、`action`、`entity_type`/`entity_id`、`before_state`/`after_state`。前端的時間軸與各實體的「歷史紀錄」皆由此表驅動，不另外維護專屬的稽核表，避免稽核紀錄與實際狀態不同步。
