# TaskGo 官網 SEO 長文串接規格

> 給：GO 行銷中心（gomkt2026 / go-marketing-center）
> 來自：TaskGo（taskgo_line）
> 版本：v1.0
> 日期：2026-09-18
> 官網：https://dev.taskgo.com.tw/
> 行銷中心：https://go-marketing-center.pages.dev/
> 對齊：Homigo `GO_MARKETING_WEBSITE_ARTICLE_SPEC.md` v1.0（payload 與頻道契約相同，品牌內容不同）

本文是雙方契約。GO 行銷中心依此生成、審核、發布官網長文；TaskGo 依此收文並在官網輸出可被 Google / AI 搜尋收錄的 HTML。不要另做一套生成器，沿用既有品牌智慧、Google 關鍵字、市場情報、內容中心、發布管理。

品牌知識來源：`docs/行銷/TaskGo_品牌行銷資料.md`。產品或定價異動時先改該檔，再生成官網文。

---

## 1. 目標

在 TaskGo 官網新增「工地知識」文章區，讓 Google 與 AI 搜尋（Google AI 總覽、ChatGPT、Gemini）收得到 TaskGo 內容，把流量導回 `dev.taskgo.com.tw`。

公開 URL：

| 頁面 | URL |
|---|---|
| 列表 | `https://dev.taskgo.com.tw/blog` |
| 內文 | `https://dev.taskgo.com.tw/blog/{slug}` |

canonical 一律用 `https://dev.taskgo.com.tw`。`app.taskgo.com.tw` 若仍為產品入口，不拿來當文章網址。

發布後立刻上架，TaskGo **不再二次審核**。

---

## 2. 原則（必讀）

1. **官網是第 4 個發布頻道，但內容類型是長文。** 不可把 Threads / IG / FB 短文原樣貼上官網。
2. **文章必須活在 dev.taskgo.com.tw。** 不可 iframe GO 行銷中心。Google 與 AI 只會把內容算在實際輸出 HTML 的網域。
3. **沿用現有八大模組。** 品牌智慧 → 市場情報 →（可選）AI 會議室 → 決策 → Campaign → 內容生成 → 內容中心審閱 → 發布管理。只新增 `publishing_platform = website`，品牌切到 TaskGo。
4. **AI 協助，人決定。** 生成後必須人工審閱才能呼叫 TaskGo。AI 不得自行發布。
5. **品牌知識不互混。** TaskGo 文只載入 TaskGo 已發布 Brand Version。跨品牌（TaskGo × Homigo）只能用 Collaboration Brief。
6. **SEO 效果來自「好摘 + 相關詞」，不是標題堆字。** 現行搜尋會先讓 AI 讀頁、摘一段、再推播。機器好收集的答案必須放最前面；相關詞要寫進內文場景。
7. **官網長文語氣 ≠ 社群語氣。** 社群可台味、引戰、釣留言；官網用繁中、專業但接地氣。少用台語梗，不用「恁爸／頭仔」當標題。

---

## 3. 職責

| 端 | 負責 | 不負責 |
|---|---|---|
| GO 行銷中心 | 選題、生成、編輯、規則檢查、人工審核、一鍵發布 / 更新 / 下架、社群貼文附文章連結 | 官網版面、sitemap、Search Console |
| TaskGo | 收文、存檔、SSR 列表 / 內文、meta、JSON-LD、sitemap、robots | 生成、二次審核 |

TaskGo 會存一份已發布內容。GO 行銷中心暫時掛掉，官網文章仍可讀。

payload 欄位與 Homigo 官網長文相同（`external_id` / `slug` / `seo_*` / `answer_box` / `body_md` / `faq`）。GO 行銷中心用同一套 `website` 頻道，依品牌換成 TaskGo 目的地與品牌包。

---

## 4. 用既有功能生成（不要重做）

### 4.1 生成前必備三包

缺任何一包，不得生成。

| 包 | 來源模組 | 必含 |
|---|---|---|
| 品牌包 | 品牌智慧（當前已發布 TaskGo Brand Version） | 定位、受眾、內容支柱、規則邊界、CTA、關鍵訊息 |
| 關鍵字包 | Google 關鍵字搜尋 | 主關鍵字 1 個 + 相關詞 6–12 個 + 搜尋意圖 |
| 話題包 | 市場情報 或 熱點主題庫 | 要嘛綁 `market_signal`，要嘛標 `evergreen` + 支柱題 |

`brand_keywords`（Hashtag / CTA / 關鍵訊息）是品牌用語，**不是** Google 搜尋量詞。兩者都進 prompt，用途不同：

- 品牌用語：語氣、CTA、可宣稱內容
- Google 關鍵字：選題、標題、文首答案、內文相關詞

### 4.2 各模組怎麼用

**讓文章寫對**

| 模組 | 用法 |
|---|---|
| 品牌智慧 | 生成必載入當前已發布 TaskGo 版本。標題語氣、價格、未上線功能，全部以規則為準 |
| 規則邊界 | 生成後自動檢查 `can_claim` / `cannot_claim` / `negative_rule`。違規擋下或標紅，才能進審閱 |
| 平台調性 | 新增 `website`（TaskGo）：繁中、專業但接地氣、800–1800 字、H2/H3、文末免費試用 + LINE CTA |
| 內容支柱 | 每篇只掛一個。列表分類對齊：痛點共鳴、產品教學、產業趨勢、信任案例、互動話題 |
| 持續學習 | 當建議注入 prompt（哪些支柱 / CTA 較有效），不改品牌定位 |

**讓文章能被搜到、有話題**

| 模組 | 用法 |
|---|---|
| Google 關鍵字搜尋 | 主關鍵字 1 個寫進 `seo_title`、`seo_description`、文首答案、一個 H2。相關詞 6–12 個自然寫進內文，不堆標題 |
| 市場情報 | 產業趨勢文必須綁一筆 `market_signal`（相關性建議 ≥ 0.6）。沒熱點就寫 Evergreen，不硬蹭 |
| 熱點主題庫 | 熱點先對品牌自己的題庫，再對當日新聞 |
| AI 會議室 | 爭議政策、跨品牌長文先開會再寫 |
| 品牌合作 | 聯名文只讀 brief，不互讀完整 Brand Knowledge |

**發布**

| 模組 | 用法 |
|---|---|
| 內容中心 | `content_type = article`，走既有審閱。`seo_meta` 必填見 §7 |
| 發布管理 | 新增平台 `website`。批准後建立 Publishing Job，呼叫 TaskGo upsert，回寫 `public_url` |
| Dashboard | 可多一列「待發官網長文」 |

### 4.3 建議生成流程

```
選題（Google 關鍵字 + 市場情報 / 熱點庫 + 內容支柱）
  → 必要時 AI 會議室
  → 管理者批准題目
  → 載入品牌包 + 關鍵字包 + 話題包
  → 生成（固定正文順序，見 §5）
  → 規則邊界檢查
  → 內容中心人工審閱
  → 發布管理 website → PUT TaskGo ingest
  → UI 顯示已發布連結
  → 同主題社群貼文附上該 URL
```

---

## 5. 正文順序（GEO，不可顛倒）

現行搜尋多半先讓 AI 讀頁、摘一段、再推給使用者。開頭只寫故事或先打廣告，機器常摘不到。

固定順序：

| 順序 | 區塊 | 要求 |
|---|---|---|
| 1 | 文首答案區 `answer_box` | 80–150 字。先直接回答主關鍵字的問題。一句定義 + 三點結論。整段要能被 AI 摘走 |
| 2 | 相關詞場景 | 接下來 2–3 段，把 6–12 個相關詞寫進真實工地／工程行場景。讓主題被看懂，不是重複主詞 |
| 3 | 展開說明 | H2/H3、步驟、對照表、注意事項。小標用問句或完整短句 |
| 4 | FAQ | 3–5 題。問句接近搜尋原話，答案 2–4 句、可獨立被摘 |
| 5 | 品牌與 CTA | TaskGo / 免費試用 / LINE 放最後。不要開頭先廣告 |

官網頁面也照這個順序渲染：答案區 → 內文 → FAQ → CTA。JSON-LD 會帶 `Article` + `FAQPage`。

禁止：

- 開頭只寫故事
- 相關詞全擠標題
- 同一句重複堆主關鍵字
- FAQ 空話（「歡迎詢問」「視情況而定」）
- 開頭先推 TaskGo / 免費試用 / 加 LINE
- 把社群引戰體、留言 +1、轉發頭仔當官網正文

### 5.1 相關詞怎麼寫

主關鍵字不要只出現一次，也不要每段都貼同一個詞。

例：主關鍵字「工程派工」

相關詞應自然出現：工地打卡、LINE 通知、排班、請款、施工回報、電子簽名、出勤、成本。

錯誤：標題寫「工程派工、工程派工系統、工程派工軟體、工程派工 App」。
正確：文首先答「工程派工怎麼排」，內文用打卡、排班、請款把場景講完。

優先選搜尋意圖是「想了解／想解決」的詞，不要只堆品牌名「TaskGo」。

### 5.2 website 平台調性（TaskGo）

- 語言：繁體中文（台灣用語）
- 性格：懂工地、專業但接地氣、務實；不像軟體業務
- 先講痛點與場景，再講做法；少講技術名詞
- 可寫：遷就人、留紀錄、零學習成本、會傳 LINE 就會用
- 不可寫：賦能、數位轉型升級、全台第一
- 正文 800–1800 字（不含 FAQ）
- 至少 3 個 H2
- 文末 CTA：免費試用 14 天（不綁信用卡）+ 加入 LINE 官方帳號 `@taskgo`

---

## 6. 分類與支柱

每篇只選一個 `category`：

| category | 對應支柱 | 何時用 |
|---|---|---|
| `pain` | 痛點共鳴 | 代打卡、群組考古、白板排班、請款已讀、月底才知賠錢 |
| `product` | 產品教學 | 單一功能怎麼用、解決什麼（LINE 打卡、派工行事曆、業主查看） |
| `policy` | 產業趨勢 | 必須綁 `market_signal_id`（缺工、碳費、ESG、AI 落地、開工潮） |
| `trust` | 信任案例 | 流程、留痕、核准數據、匿名導入故事。不捏造用戶數字 |
| `talk` | 互動話題 | 可上官網的知識向；投票文、引戰體較適合社群，不要硬發官網 |

時事守則：只蹭工地、工程、修繕、搬家、缺工、ESG、AI、做工的人文化。政治、宗教、災難傷亡、工安意外只提供資訊協助，不消費事件。政策用中立說明 + 產品如何幫得上忙。

點工Go、服務市集是 TaskGo 子品牌，可寫進 TaskGo 文。Homigo 是生態夥伴，不得說成 TaskGo 自有品牌。Washgo 未上線，不得生成、不得宣稱可用。

---

## 7. 欄位規格

發布到 TaskGo 的 payload。`external_id` 建議用 GO 行銷中心的 `contents.id`。

### 7.1 必填

| 欄位 | 型別 | 限制 | 說明 |
|---|---|---|---|
| `external_id` | string | 1–80 | GO MC 內容 ID，唯一鍵 |
| `slug` | string | `^[a-z0-9-]{3,80}$` | 英文短網址，全站唯一。發布後不建議改 |
| `title` | string | 12–60 字 | 頁面 H1 |
| `description` | string | 40–160 字 | 列表摘要 |
| `seo_title` | string | 12–60 字 | `<title>`，含主關鍵字 |
| `seo_description` | string | 70–160 字 | meta description，含主關鍵字或一個相關詞 |
| `primary_keyword` | string | 2–20 字 | Google 主關鍵字，恰好 1 個 |
| `related_terms` | string[] | 6–12 個 | 長尾、同義、場景詞 |
| `search_intent` | string | `informational` / `solution` | 想了解 / 想解決 |
| `category` | string | 見 §6 | 每篇一個 |
| `answer_box` | string | 80–150 字 | 文首可摘答案 |
| `body_md` | string | 800–1800 字 | Markdown。不含答案區與 FAQ |
| `faq` | object[] | 3–5 題 | `{ "question", "answer" }` |
| `cta` | string | — | 文末行動，須含免費試用或 LINE `@taskgo` |
| `status` | string | `published` | upsert 時表示要上架 |
| `published_at` | string | ISO 8601 | 台北時間對應的時間戳 |

### 7.2 選填

| 欄位 | 型別 | 說明 |
|---|---|---|
| `cover_image_url` | string | 只收 `https`。TaskGo 不代傳檔 |
| `og_image_url` | string | 預設用封面 |
| `tags` | string[] | 最多 8 個，給列表篩選 |
| `author` | string | 預設 `TaskGo` |
| `market_signal_id` | string | `category = policy` 時必填 |
| `brand_version_id` | string | 生成當下品牌版本，供追溯 |
| `pillar` | string | 內容支柱名稱 |

### 7.3 `seo_meta`（內容中心存檔）

```json
{
  "slug": "construction-dispatch-system",
  "seo_title": "工程派工怎麼排？打卡、排班與請款一次看懂",
  "seo_description": "工程派工不必再用白板跟人追。這篇說明打卡、排班、LINE 通知與請款怎麼一次看完。",
  "primary_keyword": "工程派工",
  "related_terms": ["工地打卡", "LINE 通知", "排班", "請款", "施工回報", "電子簽名", "出勤", "成本"],
  "search_intent": "solution"
}
```

### 7.4 slug 規則

- 只允許小寫英文、數字、連字號
- 反映主關鍵字語意，例如 `construction-dispatch-system`、`line-site-checkin`
- 不用日期、不用中文、不連續 `--`
- 已發布後若改 slug，舊網址會 404。需要改請先下架再發新篇，或與 TaskGo 約好 301（本期不做）

---

## 8. TaskGo Ingest API

Base：

```
https://api.dev.taskgo.com.tw
```

認證：每個請求帶

```
X-Go-Marketing-Key: <雙方約定的 shared secret>
```

也接受 `Authorization: Bearer <key>` 或 `X-Api-Key`（與既有 Homigo 整合同一寫法）。沒有 key、key 錯：`401`。

環境變數（TaskGo）：`GO_MARKETING_WEBSITE_KEY`。

### 8.1 發布或更新

```
PUT /api/integrations/gomarketing/articles
```

同一 `external_id` 再 PUT = 更新，官網立刻改內容，sitemap `lastmod` 更新。

成功 `200`：

```json
{
  "success": true,
  "article": {
    "external_id": "content-uuid",
    "slug": "construction-dispatch-system",
    "status": "published",
    "public_url": "https://dev.taskgo.com.tw/blog/construction-dispatch-system"
  }
}
```

發布管理 UI 必須顯示 `public_url`，標示「已發佈連結」。

### 8.2 下架

```
POST /api/integrations/gomarketing/articles/{external_id}/unpublish
```

成功後：列表與 sitemap 消失；該 slug 回 404 或 410。

### 8.3 錯誤碼

| HTTP | 情況 |
|---|---|
| 400 | 缺必填、slug 格式錯、相關詞不足 6 個、FAQ 不足 3 題、`answer_box` 過短、policy 沒綁 market_signal、CTA 未含試用或 `@taskgo` |
| 401 | 缺 key 或 key 錯 |
| 409 | slug 已被另一個 `external_id` 使用 |
| 404 | unpublish 時找不到 `external_id` |
| 413 | `body_md` 過長（建議上限 50KB） |

錯誤格式：

```json
{ "success": false, "error": "related_terms 至少 6 個" }
```

### 8.4 完整 payload 範例

```json
{
  "external_id": "8f2c1a10-0b3e-4d2a-9c11-4a0e6f1b2c3d",
  "slug": "construction-dispatch-system",
  "title": "工程派工怎麼排？打卡、排班與請款一次看懂",
  "description": "工程派工常卡在排班與現場回報。這篇用打卡、LINE 通知、施工回報與請款，說明怎麼一次看完。",
  "seo_title": "工程派工怎麼排？打卡、排班與請款一次看懂",
  "seo_description": "工程派工不必再用白板跟人追。這篇說明打卡、排班、LINE 通知與請款怎麼一次看完。",
  "primary_keyword": "工程派工",
  "related_terms": ["工地打卡", "LINE 通知", "排班", "請款", "施工回報", "電子簽名", "出勤", "成本"],
  "search_intent": "solution",
  "category": "pain",
  "answer_box": "工程派工，指依工種、地點與當日人力，把人排到對的工地，並留下打卡與施工回報。做得到的做法有三：排班看得到誰在哪、現場用 LINE 打卡回報、請款對得上出勤與完工。少用人追、少用白板重抄，工地才不會靠感覺經營。",
  "body_md": "## 工程派工當天怎麼確認有沒有人到？\n\n……（800–1800 字，含相關詞場景與至少 3 個 H2）……",
  "faq": [
    {
      "question": "工地打卡一定要下載 APP 嗎？",
      "answer": "不一定。現場用每天都在用的 LINE 打卡即可，含位置驗證。老師傅會傳訊息，就會打卡。"
    },
    {
      "question": "工程派工排班要看哪些條件？",
      "answer": "工種、證照、目前工作量、與工地距離。對不上再查是否請假或已有別的案場。"
    },
    {
      "question": "請款要對哪些紀錄？",
      "answer": "出勤打卡、施工回報、電子簽名與完工時間。對得上，月底才不必用人追請款單。"
    }
  ],
  "cta": "想把打卡、排班與請款放在同一處，免費試用 TaskGo 14 天（不綁信用卡），或加入 LINE 官方帳號 @taskgo。",
  "cover_image_url": "https://example.com/cover.jpg",
  "og_image_url": "https://example.com/cover.jpg",
  "tags": ["派工", "打卡", "請款"],
  "author": "TaskGo",
  "market_signal_id": null,
  "brand_version_id": "taskgo-v1",
  "pillar": "痛點共鳴",
  "status": "published",
  "published_at": "2026-09-18T08:00:00+08:00"
}
```

---

## 9. 品牌與事實邊界

生成與審閱都必須遵守。來源：品牌智慧當前版本 + `docs/行銷/TaskGo_品牌行銷資料.md`。

可宣稱：

- 「工地人不是不懂科技，是以前的科技不懂工地。」
- 「遷就人，不遷就工具。」
- 「會傳 LINE，就會用 TaskGo。」
- 「免費試用 14 天，無需綁定信用卡。」
- 「500+ 團隊使用」
- 「派工時間減少 70%」（須以客戶案例口吻，不得寫成全體平均）
- 「台灣 2,100 萬 LINE 用戶，員工零學習成本」
- 「30 秒完成註冊」
- 點工Go、服務市集為 TaskGo 已上線能力
- Homigo 報修可流向 TaskGo 廠商（生態夥伴，不是 TaskGo 自有品牌）

不可宣稱：

- 市佔率第一、全台第一、「保證」「100%」「最便宜」
- 第 9 節清單以外的用戶數字或百分比
- 未上線功能當現有功能
- 自行編造方案價格（價格以官網 `/pricing` 為準；本文不另報價）
- 把 Homigo / Washgo 說成 TaskGo 自有品牌
- Washgo 已可使用
- 暗示可逃漏稅、違建施工或規避法規
- 揭露客戶真實名稱、案場地址、合約金額（案例一律匿名）
- 描述 API Key、內部端點、資料庫或部署細節

語調避免：恐嚇行銷、貶低競品、嘲笑師傅或業主、誇大。

---

## 10. CTA 與社群導流

- 文末才出現品牌、免費試用與 LINE。
- 主要 CTA：免費試用 14 天 → `https://dev.taskgo.com.tw/register`（不綁信用卡）。
- 並列 CTA：加入 LINE 官方帳號 `@taskgo`（`https://line.me/R/ti/p/@taskgo`）。
- 次要可連回官網對應區塊（`/pricing`、`/docs`、工班媒合、服務市集）。
- 同一主題若發 Threads / IG / FB，貼文必須附 `public_url`，把權重導回官網。
- 社群貼文仍走各平台調性（短、圖卡、口語、可釣留言），不要貼整篇長文。

---

## 11. TaskGo 官網會做的事（對方不用做）

GO 行銷中心不實作下列項目。TaskGo 本 repo 實作。

### 11.1 公開頁

- `/blog` 列表、`/blog/{slug}` **後端 SSR 完整 HTML**
- 頁面順序：答案區 → 內文 → FAQ → CTA
- `title`、`description`、canonical、OG、Twitter Card
- JSON-LD：`Article` + `FAQPage`
- `/sitemap.xml`（含 `/`、`/pricing`、`/blog`、每篇已發布 slug）、`/robots.txt`
- 首頁導覽「工地知識」→ `/blog`
- 下架後列表與 sitemap 移除；該 slug 回 404 或 410

不可只靠現有 React SPA client render。Google 與 AI 要收的是第一個 HTML response 裡的正文。

建議最短路徑：Flask 直接輸出 `/blog` 與 `/blog/<slug>` 的 HTML（不因此把整站改成 Next.js）。現有 Landing（`/`、`/pricing`、`/docs`）維持現況。

### 11.2 資料落地

表名建議 `"WebsiteArticle"`，唯一鍵 `"ExternalId"`（GO `contents.id`）與 `"Slug"`。

必存：title / description / seo_title / seo_description / primary_keyword / related_terms / search_intent / category / answer_box / body_md / faq / cta / status / published_at / cover_image_url / og_image_url / tags / author / brand_version_id。

`status`：`published` | `unpublished`。列表與 sitemap 只出 `published`。

### 11.3 路由（TaskGo）

| 方法 | 路徑 | 對象 | 說明 |
|---|---|---|---|
| `PUT` | `/api/integrations/gomarketing/articles` | GO MC | upsert，立刻上架 |
| `POST` | `/api/integrations/gomarketing/articles/{external_id}/unpublish` | GO MC | 下架 |
| `GET` | `/blog` | 公開 | SSR 列表 |
| `GET` | `/blog/<slug>` | 公開 | SSR 內文 |
| `GET` | `/sitemap.xml` | 公開 | 含文章 lastmod |
| `GET` | `/robots.txt` | 公開 | 指向 sitemap |

對方不用做官網版面、不必 iframe、不必自己產 sitemap。

---

## 12. 驗收標準

### 12.1 GO 行銷中心

1. `publishing_platform` 新增 `website`（與 Homigo 共用頻道，目的地依品牌切換）
2. 官網長文生成必須同時載入 TaskGo 品牌包、關鍵字包、話題包
3. 生成結果含 `answer_box`、相關詞 6–12、FAQ 3–5、固定正文順序
4. 規則邊界檢查通過才能進審閱（含 §9）
5. 人工批准後才呼叫 TaskGo `PUT`
6. 發布成功後 UI 顯示 `public_url`
7. 更新走同一 `PUT`；下架走 `unpublish`
8. 同主題社群貼文帶官網文章 URL
9. 一支測試文走通：發布 → 官網看得到 → 改文 → 官網更新 → 下架 → 官網消失

### 12.2 TaskGo（本 repo）

1. ingest API 依 §8 收文、驗 key、驗欄位
2. `/blog`、`/blog/{slug}` 第一個 HTML 就含答案區、正文、FAQ、meta、JSON-LD
3. sitemap 含已發布文章；下架後移除
4. 導覽有「工地知識」
5. GO 行銷中心掛掉時，已發布文章仍可讀

---

## 13. 不做

- TaskGo 後台二次審核
- 把研討會新聞稿搬進 `/blog`
- 官網全文搜尋
- 自動送 Google Indexing API（上線後人工提交 Search Console）
- 用 iframe 掛 GO 行銷中心頁面
- 把社群短文當官網長文發布
- 把操作手冊 `/docs` 當成 SEO 長文（手冊給已使用者；`/blog` 給搜尋進來的人）
- 本期不做 slug 變更 301

---

## 14. 雙方聯絡與後續

1. GO 行銷中心依本文實作生成與 `website` 頻道（可先 mock TaskGo API；與 Homigo 共用 schema）。
2. TaskGo 實作 ingest、`"WebsiteArticle"`、`/blog` SSR、sitemap 後，把正式 key 交換方式補進 §8。
3. 用 §12.1 第 9 條測試文對打一次（`https://dev.taskgo.com.tw/blog`）。
4. 正式量產前，先發 1 篇 Evergreen 測收錄，再發產業趨勢文。
5. Search Console 屬性綁 `https://dev.taskgo.com.tw/`，提交 sitemap。
