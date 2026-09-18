# Washgo 官網 SEO 文章區實作規格

> 對象：Washgo 工程與營運  
> 對 GO 行銷中心的契約：[GO_MARKETING_WEBSITE_ARTICLE_SPEC.md](./GO_MARKETING_WEBSITE_ARTICLE_SPEC.md)  
> 版本：v1.0  
> 日期：2026-09-18

本文說明 Washgo **自己要做的事**：收 GO 行銷中心的長文、存檔，並在 `washgo.com.tw` 輸出可被 Google / AI 收錄的 HTML。生成、審核、一鍵發布由對方做。

---

## 1. 為什麼官網要自己出 HTML

搜尋引擎與 AI 只會把內容算在**實際輸出正文的網域**。若文章活在 `go-marketing-center.pages.dev`，或只在瀏覽器打 API 再灌進空殼頁，權重不會算給 `washgo.com.tw`。

因此：

- 不可 iframe GO 行銷中心
- 不可只做客戶端列表、內文再 fetch
- `/blog`、`/blog/{slug}` 的第一份 HTML 必須含 `answer_box`、正文、FAQ
- GO 行銷中心掛掉時，已發布文章仍可讀

---

## 2. 現況與必要變更

現行 `apps/website` 是 Next.js **靜態輸出**（`output: "export"`），部署為 Cloudflare Pages 專案 `washgo-website`，把 `apps/website/out` 整包上傳。行銷首頁、品牌目錄可以維持靜態。

文章區不行走這條路：發布後要立刻上架，不能等下次 push `main` 才重建。

建議拆成兩層，不要一次重寫整站：

| 層 | 做法 | 說明 |
|---|---|---|
| 行銷頁 | 維持靜態 | `/`、`/brands` 等既有頁 |
| 文章區 | 伺服端輸出 HTML | `/blog`、`/blog/{slug}`、`/sitemap.xml`、`/robots.txt` |

建議實作順序：

1. Neon 加 `website_articles` 表
2. `washgo-api` 做 ingest + 公開讀取
3. 官網文章路由改為可在請求時取文（見 §5）
4. 導覽、頁尾、sitemap、JSON-LD
5. 與 GO 行銷中心用測試文對打

---

## 3. 公開資訊架構

| 頁面 | URL | 誰看 |
|---|---|---|
| 列表 | `https://washgo.com.tw/blog` | 最新已發布文章，預設偏 `consumer` |
| 內文 | `https://washgo.com.tw/blog/{slug}` | 答案區 → Markdown 正文 → FAQ → CTA |
| sitemap | `https://washgo.com.tw/sitemap.xml` | 首頁、品牌目錄、已發布文章 |
| robots | `https://washgo.com.tw/robots.txt` | 允許抓取，指向 sitemap |

導覽名稱：**洗衣知識**。Navbar、Footer、首頁可放入口。

下架後：

- 列表不出現
- sitemap 移除
- 該 slug 回 **404**（本期不做 410 / 301）

---

## 4. 資料儲存

存在 Neon PostgreSQL，與訂單同一套庫。官網不直接連 GO 行銷中心。

建議表名 `website_articles`，**不掛 `brand_id`**：這是平台官網內容，不是加盟品牌後台資料。

### 4.1 欄位

| 欄位 | 型別 | 約束 |
|---|---|---|
| `id` | uuid PK | 預設 `gen_random_uuid()` |
| `external_id` | varchar(80) | unique，GO `contents.id` |
| `slug` | varchar(80) | unique，`^[a-z0-9-]{3,80}$` |
| `title` | varchar(120) | |
| `description` | varchar(240) | |
| `seo_title` | varchar(120) | |
| `seo_description` | varchar(240) | |
| `primary_keyword` | varchar(40) | |
| `related_terms` | jsonb | string[] |
| `search_intent` | varchar(20) | `informational` / `solution` |
| `category` | varchar(20) | `pain` / `product` / `policy` / `trust` / `talk` |
| `audience` | varchar(20) | `consumer` / `merchant`，預設 `consumer` |
| `answer_box` | text | |
| `body_md` | text | |
| `faq` | jsonb | `{question, answer}[]` |
| `cta` | text | |
| `cover_image_url` | text | 可空 |
| `og_image_url` | text | 可空 |
| `tags` | jsonb | string[] |
| `author` | varchar(80) | 預設 `Washgo` |
| `market_signal_id` | varchar(80) | 可空 |
| `brand_version_id` | varchar(80) | 可空 |
| `pillar` | varchar(80) | 可空 |
| `status` | varchar(20) | `published` / `unpublished` |
| `published_at` | timestamptz | |
| `unpublished_at` | timestamptz | 可空 |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

索引：

- unique `external_id`
- unique `slug`
- `(status, published_at desc)` 給列表
- `(status, category, published_at desc)` 給分類

`body_md` 存原文，渲染時再轉 HTML。不要在寫入時預先存一份 HTML，以免更新不同步。

封面只收 `https` URL，不代傳到 R2。

---

## 5. 官網怎麼出 HTML

### 5.1 建議：官網改 next-on-pages，只有文章路由動態

`apps/admin`、`apps/liff` 已走 Cloudflare `next-on-pages`。官網可同一套：

1. 拿掉 `apps/website/next.config.ts` 的 `output: "export"`
2. `/blog`、`/blog/[slug]` 用 Server Component，請求時打 `washgo-api` 公開讀取（或官網 Worker 直讀 Neon）
3. 既有首頁維持靜態產生
4. 部署從「上傳 `out/`」改成 next-on-pages Pages Function

優點：發布後立刻上架、第一份 HTML 就有正文、與現有 Cloudflare 帳號一致。

### 5.2 次選：靜態站 + 同網域 Worker

若暫時不想改整站建置：

1. 行銷頁繼續靜態部署
2. 另做一個 Worker（或 Pages Function）處理 `/blog*`、`/sitemap.xml`、`/robots.txt`
3. `washgo.com.tw` 用 Cloudflare 路由把這些 path 指到 Worker

優點：不動既有首頁建置。缺點：多一個服務、路由要維護。

### 5.3 不做

- 建置時把文章寫進靜態 HTML，靠 webhook 重建整站（上架有延遲，重建失敗會卡住）
- 空殼 `/blog` 頁面進瀏覽器再 fetch（SEO / GEO 不合格）

### 5.4 頁面渲染順序

與契約 §5 相同，不可顛倒：

1. H1 = `title`
2. 文首答案區 = `answer_box`（視覺上要像可被摘走的摘要框）
3. `body_md` → HTML（允許 H2/H3、列表、表格、連結）
4. FAQ
5. CTA（消費者導 `https://line.me/R/ti/p/@washgo`，業者導 mailto）

Markdown 只開安全子集：標題、段落、列表、連結、粗斜體、表格。禁止 raw HTML、script、iframe。

### 5.5 每頁 SEO 標籤

內文頁：

- `<title>` = `seo_title`
- `meta name="description"` = `seo_description`
- `link rel="canonical"` = `https://washgo.com.tw/blog/{slug}`
- Open Graph / Twitter Card：title、description、url、image（無圖用官網 OG 預設）
- JSON-LD `Article`：headline、description、datePublished、dateModified、author、publisher、image、mainEntityOfPage
- JSON-LD `FAQPage`：對應 `faq[]`

列表頁：

- title：`洗衣知識｜Washgo`
- description：說明這是洗護與送洗知識，不是新聞稿
- canonical：`https://washgo.com.tw/blog`

`sitemap.xml` 至少包含 `/`、`/brands`、`/blog`、所有 `status = published` 的 `/blog/{slug}`。`lastmod` 用 `updated_at`。

---

## 6. API

Base：`https://washgo-api.washgotaskgo.workers.dev`

契約路徑見 [GO_MARKETING_WEBSITE_ARTICLE_SPEC.md](./GO_MARKETING_WEBSITE_ARTICLE_SPEC.md) §8。這裡補 Washgo 實作細節。

### 6.1 認證

| 路徑 | 認證 |
|---|---|
| `PUT /v1/integrations/gomarketing/articles` | `X-Go-Marketing-Key` |
| `POST /v1/integrations/gomarketing/articles/:external_id/unpublish` | 同上 |
| `GET /v1/public/articles` | 無。只回已發布摘要 |
| `GET /v1/public/articles/:slug` | 無。只回已發布全文 |

Secret：`GO_MARKETING_INGEST_KEY`，用 `wrangler secret put`，不要進 repo。與 GO 行銷中心交換後，回填契約 §8。

CORS：

- ingest 是 server-to-server，不靠瀏覽器 CORS
- 公開 GET 若給官網 Server Component 用，也走伺服端，不暴露 key
- 既有 CORS `allowHeaders` 要補 `X-Go-Marketing-Key`，以免對方用瀏覽器工具測通時被擋

### 6.2 寫入校驗

PUT 時在 API 擋下來的最低限度（與契約 §7、§8.3 對齊）：

- 必填欄位都在
- `slug` 符合 `^[a-z0-9-]{3,80}$`
- `related_terms` 6–12 個
- `faq` 3–5 題，每題 question / answer 非空
- `answer_box` 80–150 字
- `body_md` 約 800–1800 字、上限 50KB
- `category = policy` 必須有 `market_signal_id`
- 消費者 CTA 含 `@washgo` 或 `line.me/R/ti/p/@washgo`
- `audience = merchant` 時 CTA 含 `hello@washgo.com.tw`
- `cover_image_url` / `og_image_url` 若有值必須 `https`

同一 `external_id`：upsert，立刻覆蓋，更新 `updated_at`。  
同一 `slug` 被另一個 `external_id` 占用：`409`。

下架：`status = unpublished`，填 `unpublished_at`。不實體刪除，方便之後對帳。

### 6.3 公開讀取

`GET /v1/public/articles`

- query：`category`、`audience`、`limit`（預設 20，上限 50）、`offset`
- 只回 `published`
- 預設 `published_at desc`
- 不要回 `external_id`、`brand_version_id`、`market_signal_id` 等內部欄位

`GET /v1/public/articles/:slug`

- 已發布：全文（含 `answer_box`、`body_md`、`faq`、`cta`、SEO 欄位）
- 其他：`404`

官網若改為 Worker 直讀 Neon，公開 GET 可晚做；ingest 仍必須先上，GO 才能對打。

---

## 7. 官網 UI

視覺跟現有官網：深藍 `#1D4F8C`、品牌藍 `#3A8DDE`、金橘只給點數／優惠強調。元件可沿用 Navbar / Footer。

### 7.1 列表 `/blog`

- 頁首：洗衣知識 + 一句說明（洗護、送洗、省心，不是新聞中心）
- 卡片：封面（可選）、title、description、category、published_at
- 分類篩選可做，不是本期必做
- 空狀態：尚無文章時給一句話，不要空白頁

分類顯示名：

| category | 中文 |
|---|---|
| `pain` | 生活痛點 |
| `product` | 怎麼用 |
| `policy` | 時事 |
| `trust` | 安心送洗 |
| `talk` | 洗護知識 |

### 7.2 內文 `/blog/[slug]`

- 麵包屑：首頁 / 洗衣知識 / 本文
- 答案區用框或底色與正文分開，方便人眼與機器一起抓
- FAQ 用 `<h2>` + 問答，對應 JSON-LD
- CTA 區塊在最後：消費者綠底 LINE 按鈕；業者用 mailto
- 相關文章本期可不做

### 7.3 導覽

`Navbar`、`Footer` 加「洗衣知識」→ `/blog`。從文章頁點 Logo 回首頁。

---

## 8. Search Console 與上線

本期**不**接 Google Indexing API。上線後人工做：

1. Search Console 確認 `washgo.com.tw` 資源
2. 提交 `https://washgo.com.tw/sitemap.xml`
3. 第一篇 Evergreen 發布後，用網址檢查看抓到的 HTML 是否含 `answer_box`
4. 再發政策時事文

建議第一篇測試題（與契約 §14 對齊）：

- 消費者 Evergreen：`到府收送洗衣` 或 `羽絨外套怎麼洗`
- 走通：發布 → 官網看得到 → 改一句 → 官網更新 → 下架 → 404

---

## 9. 建議檔案

實作時再新增，本文只定位置：

```
packages/db/src/schema/core.ts          # websiteArticles
packages/db/drizzle/00xx_website_articles.sql
apps/api/src/routes/gomarketing-articles.ts
apps/api/src/routes/public-articles.ts
apps/website/src/app/blog/page.tsx
apps/website/src/app/blog/[slug]/page.tsx
apps/website/src/app/sitemap.ts         # 或獨立 Worker
apps/website/src/app/robots.ts
apps/website/src/lib/articles.ts
apps/website/src/components/Navbar.tsx  # 加洗衣知識
apps/website/src/components/Footer.tsx
```

環境變數：

| 名稱 | 位置 | 說明 |
|---|---|---|
| `GO_MARKETING_INGEST_KEY` | `apps/api` secret | ingest 共用密鑰 |
| `NEXT_PUBLIC_API_BASE_URL` 或伺服端 `WASHGO_API_URL` | website | 公開讀取 base。Server Component 不要用瀏覽器 CORS 當主路徑 |

---

## 10. 驗收清單（Washgo 端）

1. PUT 無 key / 錯 key → 401
2. 缺相關詞或 FAQ → 400
3. 同一 `external_id` 再 PUT → 內容與 `lastmod` 更新
4. slug 衝突 → 409
5. 已發布文章在 `https://washgo.com.tw/blog/{slug}` **檢視原始碼**看得到 `answer_box` 與 FAQ（不是等 JS 再出現）
6. 列表看得到該文
7. sitemap 含該 URL
8. unpublish 後列表與 sitemap 消失，slug 404
9. JSON-LD 有 `Article` + `FAQPage`
10. 導覽「洗衣知識」可點

對方驗收見契約 §12。兩邊都過才算這條產品線上線。

---

## 11. 不做（本期）

- 官網全文搜尋
- 文章預覽草稿給 Washgo 後台審
- slug 301
- 自動 Indexing API
- 相關文章推薦演算法
- 多語系
- 把客服 help MD 或系統公告同步進 `/blog`

---

## 12. 工作順序

1. 把契約給 GO 行銷中心，對方可先 mock Washgo API。
2. Washgo 做表 + ingest + 公開讀取。
3. 官網 `/blog` 改為伺服端輸出 HTML。
4. 交換 `GO_MARKETING_INGEST_KEY`，回填契約 §8。
5. 測一篇 Evergreen，再提交 Search Console。
