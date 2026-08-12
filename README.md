# GO 行銷中心(GO Marketing Center)

多品牌、多 AI Agent 協作、可持續學習的 AI 行銷營運中心(Marketing Operating System)V1。

> AI 協助品牌思考,管理者負責最終決策。AI 永遠不取代品牌經營者。

## 核心原則

1. Every Brand Has Its Own Identity — 每個品牌都有自己的品牌人格
2. Brand Knowledge Never Mixes — 品牌知識永遠不能互相混用
3. Collaboration Requires Permission — 品牌合作需建立 Collaboration Workspace
4. AI Can Debate — AI 可以討論、可以提出不同意見
5. AI Never Makes Business Decisions — AI 永遠沒有決策權
6. Managers Always Own The Final Decision — 所有重大決策由管理者確認
7. Every Decision Is Traceable — 所有決策留下完整可回溯紀錄

完整說明見 [docs/01-principles.md](docs/01-principles.md)。

## 專案結構

```
/
├── docs/                  # 設計文件(原則、Domain Model、資料庫、IA、權限、Brand Intelligence、Collaboration、MD 規格、API Roadmap、Go生態系X頻道)
├── db/
│   ├── schema.sql         # 完整可執行 PostgreSQL Schema
│   ├── seed.sql           # Homigo / TaskGo / Washgo 三個真實品牌的種子資料
│   └── migrations/        # 累積式 schema 變更(含 008/009:Go 生態系 Collaboration + 共用 X 帳號;010:Brief 內容擴充)
├── data/brands/           # 三份原始品牌行銷文件(brand_documents 原始檔)
├── functions/             # Cloudflare Pages Functions(API + 共用邏輯)
│   ├── api/               # /api/* 路由,含 collaborations/[id]/social-accounts(Go 生態系 X 帳號設定)
│   └── _shared/           # 共用模組:prompts.ts / generate.ts / meta.ts / threads.ts / x.ts(X API 封裝)…
├── workers/scheduler/     # Cloudflare Worker:市場情報蒐集、內容生成排程、跨品牌導流、Go生態系X發文、發布佇列
├── src/                   # React + Vite + TypeScript 前端
│   ├── components/        # UI 元件(layout / ui)
│   ├── context/           # 品牌切換 Context
│   ├── pages/              # 各模組頁面(含 collaboration/CollaborationList.tsx 的 Go 生態系 X 帳號設定)
│   └── types/              # TypeScript 型別定義
└── index.html              # Vite 進入點
```

## 技術架構

- **前端**:React 18 + Vite + TypeScript + React Router + Framer Motion
- **前端部署**:Cloudflare Pages
- **資料庫**:Neon(Serverless PostgreSQL)
- **版本控制**:GitHub

## 設計文件

| 文件 | 內容 |
|---|---|
| [01-principles.md](docs/01-principles.md) | 核心價值與七大第一性原則 |
| [02-domain-model.md](docs/02-domain-model.md) | Domain Model 與 Entity 關係 |
| [03-database.md](docs/03-database.md) | 資料庫架構說明 |
| [04-information-architecture.md](docs/04-information-architecture.md) | Web IA 與 Side Menu |
| [05-permissions.md](docs/05-permissions.md) | 權限架構 |
| [06-brand-intelligence.md](docs/06-brand-intelligence.md) | Brand Intelligence 架構 |
| [07-collaboration.md](docs/07-collaboration.md) | Collaboration 架構 |
| [08-brand-markdown-spec.md](docs/08-brand-markdown-spec.md) | Brand Knowledge Markdown 規格 |
| [09-api-roadmap.md](docs/09-api-roadmap.md) | 未來 API 擴充缺口 |
| [12-ecosystem-x-channel.md](docs/12-ecosystem-x-channel.md) | Go 生態系跨品牌整合 + 共用 X(Twitter) 頻道 |

## 本地開發

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 型別檢查 + production build
```

## 資料庫

本地開發請建立 `.env`(不會上傳到 GitHub):

```
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
```

套用 Schema 與種子資料:

```bash
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql
```

## Cloudflare Pages 部署設定

- Build command: `npm run build`
- Build output directory: `dist`
- 環境變數:於 Cloudflare Pages 專案設定中加入 `DATABASE_URL`(未來串接後端 API 時使用;V1 前端純假資料,不需要此變數即可運作)

## 開發流程

```bash
git add .
git commit -m "描述你的修改"
git push
```

推送後 Cloudflare Pages 會自動重新部署。

## V1 範圍

- ✅ 完整資料庫 Schema(含品牌隔離、AI 提案/決策分離、版本化、全流程追蹤)
- ✅ 九份設計文件
- ✅ Homigo / TaskGo / Washgo 三個真實品牌的結構化種子資料
- ✅ React 前端骨架:側邊選單 + 所有核心頁面,假資料驅動,可點擊操作
- ⬜ AI API 整合(見 [09-api-roadmap.md](docs/09-api-roadmap.md))
