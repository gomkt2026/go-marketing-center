# GO 行銷中心 — 開發/維運手冊

## 架構概覽

```
Browser (React SPA)
    ↓ /api/*
Cloudflare Pages Functions (functions/)
    ↓ Hyperdrive（有 binding）或 Neon HTTP fallback
Neon PostgreSQL（Launch、關閉 scale-to-zero）
    ↑
go-marketing-scheduler → Queues（每品牌一則）→ 同一顆 Neon
```

## 環境變數

在 **Cloudflare Pages → Settings → Environment variables** 設定（Production 與 Preview 分開）：

| 變數 | 說明 | 範例 |
|------|------|------|
| `DATABASE_URL` | Neon pooled 連線字串（含 `-pooler`） | `postgresql://...@...-pooler.../neondb?sslmode=require` |
| `ADMIN_USERNAME` | 登入帳號 | `Admin` |
| `ADMIN_PASSWORD` | 登入密碼 | `Admin@2026` |
| `SESSION_SECRET` | （選填）Session 簽章密鑰 | 隨機長字串 |

本機開發：複製 `.env.example` 為 `.dev.vars`（已加入 `.gitignore`）。

## 本機開發

```bash
# 1. 安裝依賴
npm install

# 2. 套用資料庫 schema 與 seed（需 Neon DATABASE_URL）
psql "$DATABASE_URL" -f db/schema.sql
psql "$DATABASE_URL" -f db/seed.sql

# 3. 建置前端
npm run build

# 4. 啟動 Pages Functions + 靜態檔（port 8788）
npx wrangler pages dev dist --port 8788

# 5. 另開終端機啟動 Vite（port 5173，proxy /api → 8788）
npm run dev
```

## API 端點清單

### 認證
- `POST /api/auth/login` — 登入
- `GET /api/auth/me` — 取得目前使用者
- `POST /api/auth/logout` — 登出

### 健康檢查
- `GET /api/health` — DB 連線測試

### 資料
- `GET /api/brands` — 品牌列表
- `GET /api/brands/:slug` — 品牌詳情 + 版本
- `GET /api/brands/:slug/intelligence` — 品牌智慧資料
- `POST /api/brands/:slug/press-coverages/parse` — 解析新聞連結（不寫庫、不存全文）
- `POST /api/brands/:slug/press-coverages/discover` — 從網路撈取品牌相關報導候選
- `POST /api/brands/:slug/press-coverages/convert` — 轉換解析結果寫入媒體報導
- `GET /api/brands/:slug/workspace` — 工作區統計
- `GET /api/brands/:slug/market-signals` — 市場情報
- `PATCH /api/market-signals/:id` — 更新信號狀態
- `GET/POST /api/brands/:slug/campaigns` — 活動列表/建立
- `GET /api/brands/:slug/contents` — 內容列表
- `POST /api/contents/:id/review` — 內容審閱
- `GET /api/brands/:slug/publishing` — 發布列表
- `GET /api/brands/:slug/analytics` — 成效分析
- `GET /api/brands/:slug/learning` — 學習紀錄
- `GET /api/dashboard` — 總覽
- `GET /api/proposals` — 提案列表
- `POST /api/proposals/:id/decide` — 決策（含 transaction）
- `GET /api/meetings` — 會議列表
- `GET/POST /api/meetings/:id` — 會議詳情/新增訊息
- `GET /api/collaborations` — 合作案
- `GET /api/activity` — Activity log
- `GET /api/meta` — 使用者 + AI Agents
- `POST/PATCH/DELETE /api/brand-rules` — 品牌規則 CRUD

所有 `/api/*`（除 login/health）需有效 session cookie。

## 部署至 Cloudflare Pages

1. 推送程式碼至 GitHub
2. Cloudflare Pages 連接 repo，Build command: `npm run build`，Output: `dist`
3. 設定上述環境變數
4. Pages 會自動部署 `functions/` 目錄為 API

## 安全注意

- 目前為**單一共用 Admin 帳密**，適合內部小團隊
- 密碼仅存於伺服器環境變數，不出現在前端 bundle
- 建議正式環境使用強密碼，並考慮之後升級為多使用者帳號系統
- `activity_logs` 目前只能區分「Admin 做了什麼」，無法區分個別操作者

## 已知限制

- AI 會議/提案內容仍來自 seed 資料，非即時 AI 生成

## 效能升級（Workers Paid + Neon Launch + Hyperdrive）

3 品牌就出現空 500 時，先套熱路徑索引，再開付費方案拿掉免費上限。

### Cloudflare（約 USD $5／月）

1. Dashboard → **Workers & Pages → Plans** 開 **Workers Paid**（Pages Functions 與 `go-marketing-scheduler` 共用）。
2. KV `CACHE` 已建立：`0571f06408cb41fa849c1df9b5cb3066`（兩份 wrangler 已綁定）。
3. Queue `go-marketing-brand-jobs` 已建立（scheduler 已宣告 producer/consumer）。
4. Hyperdrive `go-marketing-neon` 已建立：`286329edb5f24551b6684450d1eac8f8`（連 Neon direct host）。部署 Pages 與 scheduler 後才會生效。
5. 部署後用超級管理員打 `GET /api/admin/perf-status` 確認 `hyperdrive` / `kvCache` / `brandJobsQueue`。Pages 的 log 請在 Dashboard 專案 Settings 開啟（`wrangler.toml` 的 `[observability]` 僅 scheduler 可用）。
6. 套索引：`POST /api/admin/migrate-hotpath-indexes`（含 054 的 publishing_jobs 時間索引）。

### Neon Launch（約 USD $20–40／月）

1. Neon Console → org 升 **Launch**（不必先上 Scale）。
2. Project → Compute：**關閉 scale-to-zero**。
3. min **0.25–0.5 CU**，autoscale 上限 **2 CU**。
4. 區域維持靠近台灣（例如 `ap-southeast-1`）。
5. Hyperdrive 用 **direct** 連線字串；`DATABASE_URL` secret 可暫時留 `-pooler` 當 fallback。

### 驗證

- TaskGo Threads 工作台、品牌工作區、行程表、內容列表首屏應在數秒內出現。
- Cloudflare Observability 看 threads-desk / workspace p95 與 5xx。
- Neon Monitoring：不應再有每次閒置後的冷啟動。
