# 04. Web Information Architecture 與 Side Menu

## 整體版面（App Shell）

```
┌────────────┬──────────────────────────────────────────────────┐
│  GO 行銷中心 │  頂部列: [目前品牌: Homigo ▾] [v1 已發布] [🔔] [使用者] │
│            ├──────────────────────────────────────────────────┤
│ 總覽        │                                                  │
│            │                                                  │
│ 品牌經營     │                                                  │
│ 品牌工作區   │              主內容區                              │
│ 品牌智慧     │         (依左側選單 + 目前品牌切換)                   │
│ 市場情報     │                                                  │
│            │                                                  │
│ 協作決策     │                                                  │
│ AI 會議室    │                                                  │
│ 決策中心     │                                                  │
│ 品牌合作     │                                                  │
│            │                                                  │
│ 內容營運     │                                                  │
│ 行銷活動     │                                                  │
│ 活動報名     │                                                  │
│ 內容中心     │                                                  │
│ 發布管理     │                                                  │
│            │                                                  │
│ 洞察        │                                                  │
│ 成效分析     │                                                  │
│ 持續學習     │                                                  │
│ 時間軸      │                                                  │
│            │                                                  │
│ 設定        │                                                  │
└────────────┴──────────────────────────────────────────────────┘
```

## 多品牌切換架構

- 頂部列全域品牌切換器：Homigo / TaskGo / Washgo / 全部品牌 / ＋新增品牌
- 切換後停留原頁、資料 context 換為該品牌，URL 帶品牌 slug：`/homigo/contents` ↔ `/taskgo/contents`
- 頁面分兩類：
  - **品牌範圍頁**（必須先選定品牌）：品牌智慧、市場情報、行銷活動、活動報名、內容中心、發布管理、成效分析、持續學習
  - **跨品牌全域頁**（可看全部或篩選）：總覽 Dashboard、決策中心、AI 會議室、品牌合作、時間軸
- 切換時頂部列顯示品牌識別色 + Logo，防止跨品牌誤操作
- 切換器只列出使用者有權限的品牌（對應 `brand_members`）

## Side Menu 結構

```
總覽 Dashboard

品牌經營
├─ 品牌工作區 Brand Workspace
├─ 品牌智慧 Brand Intelligence
└─ 市場情報 Market Intelligence

協作決策
├─ AI 會議室 Meeting Room
├─ 決策中心 Decision Center
└─ 品牌合作 Collaboration

內容營運
├─ 行銷活動 Campaigns
├─ 活動報名 Events(報名/報到/推薦人拆帳,詳見 10-events.md)
├─ 內容中心 Content(含 Final Review)
└─ 發布管理 Publishing

洞察
├─ 成效分析 Analytics
├─ 持續學習 Learning
└─ 時間軸 Timeline / Activity Log

設定
├─ AI Agents 管理
└─ 權限管理
```

## 路由表

| 路徑 | 頁面 | 範圍 |
|---|---|---|
| `/` | Dashboard | 全域 |
| `/:brand/workspace` | Brand Workspace 總覽 | 品牌 |
| `/:brand/intelligence` | Brand Intelligence(知識庫 + 版本歷史) | 品牌 |
| `/:brand/market` | Market Intelligence | 品牌 |
| `/meetings` | AI 會議室列表 | 全域(可篩品牌) |
| `/meetings/:id` | 會議詳情 | — |
| `/decisions` | 決策中心收件匣 | 全域(可篩品牌) |
| `/collaborations` | 品牌合作列表 | 全域 |
| `/collaborations/:id` | 合作工作區 | — |
| `/:brand/campaigns` | 行銷活動 | 品牌 |
| `/:brand/events` | 活動報名列表 | 品牌 |
| `/:brand/events/:id` | 活動詳情(場次/表單/推薦人/名單/統計) | 品牌 |
| `/e/:slug` | 公開報名頁(無需登入) | 公開 |
| `/e/:slug/ticket` | QR 票券頁 / 手機查票(無需登入) | 公開 |
| `/checkin` | 報到授權碼輸入頁(無需登入) | 公開 |
| `/checkin/:eventId` | 工作人員掃碼報到頁(staff token 授權) | 公開 |
| `/:brand/contents` | 內容中心 + Final Review | 品牌 |
| `/:brand/publishing` | 發布管理 | 品牌 |
| `/:brand/analytics` | 成效分析 | 品牌 |
| `/:brand/learning` | 持續學習 | 品牌 |
| `/timeline` | 時間軸 | 全域(可篩品牌) |
| `/settings/agents` | AI Agents 管理 | 全域 |
| `/settings/permissions` | 權限管理 | 全域 |

## 各頁面資訊架構重點

### Dashboard

四個區塊：待你決策、待審閱內容、今日市場情報、三品牌狀態總覽、最新動態(Timeline 摘要)。

### Brand Intelligence

分頁式：品牌核心 / 受眾 / 語調 / 平台調性 / 規則邊界 / 視覺 / 素材庫 / 原始檢視(唯讀編譯 MD)。頂部有版本選擇器 + 建立草稿並編輯的入口。

### AI Meeting Room

左側會議列表(進行中/已結束)，右側會議詳情(參與者頭像列 + 討論串 + 產出的 Proposal 卡)。

### Decision Center

以 Proposal 為單位的卡片列表，每張卡展開為方案 A/B/C 比較表，操作按鈕僅管理者可見。

### 內容中心

依狀態分頁(待審閱/修改中/已批准/已退回)，審閱操作區與內容預覽並列。

### 時間軸

可篩品牌與事件類型的時間流，每筆事件可展開查看 actor、前後狀態、關聯連結。

## 視覺與互動規範

配色與動畫規範另見 [05-permissions.md](05-permissions.md) 之外的實作，詳細色票與動畫設計已於前端 `src/theme` 落實：背景 `#FFFFFF`、主色 `#A7C18D`、強調色 `#ED9121`、文字 `#6C6C6C`、輔助色 `#A87C64`；互動採 Framer Motion，動畫時長 150–300ms。
