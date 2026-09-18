# Homigo 官網 SEO 長文串接規格

> 給：GO 行銷中心（gomkt2026 / go-marketing-center）  
> 來自：Homigo（homigo2026 / homigo）  
> 版本：v1.0  
> 日期：2026-09-18  
> 官網：https://www.homigo.com.tw/  
> 行銷中心：https://go-marketing-center.pages.dev/

本文是雙方契約。GO 行銷中心依此生成、審核、發布官網長文；Homigo 依此收文並在官網 SSR 展示。不要另做一套生成器，沿用既有品牌智慧、Google 關鍵字、市場情報、內容中心、發布管理。

---

## 1. 目標

在 Homigo 官網新增「租屋知識」文章區，讓 Google 與 AI 搜尋（Google AI 總覽、ChatGPT、Gemini）收得到 Homigo 內容，把流量導回 `homigo.com.tw`。

公開 URL：

| 頁面 | URL |
|---|---|
| 列表 | `https://www.homigo.com.tw/blog` |
| 內文 | `https://www.homigo.com.tw/blog/{slug}` |

發布後立刻上架，Homigo **不再二次審核**。

---

## 2. 原則（必讀）

1. **官網是第 4 個發布頻道，但內容類型是長文。** 不可把 Threads / IG / FB 短文原樣貼上官網。
2. **文章必須活在 homigo.com.tw。** 不可 iframe GO 行銷中心。Google 與 AI 只會把內容算在實際輸出 HTML 的網域。
3. **沿用現有八大模組。** 品牌智慧 → 市場情報 →（可選）AI 會議室 → 決策 → Campaign → 內容生成 → 內容中心審閱 → 發布管理。只新增 `publishing_platform = website`。
4. **AI 協助，人決定。** 生成後必須人工審閱才能呼叫 Homigo。AI 不得自行發布。
5. **品牌知識不互混。** Homigo 文只載入 Homigo 已發布 Brand Version。跨品牌（Homigo × TaskGo）只能用 Collaboration Brief。
6. **SEO 效果來自「好摘 + 相關詞」，不是標題堆字。** 現行搜尋會先讓 AI 讀頁、摘一段、再推播。機器好收集的答案必須放最前面；相關詞要寫進內文場景。

---

## 3. 職責

| 端 | 負責 | 不負責 |
|---|---|---|
| GO 行銷中心 | 選題、生成、編輯、規則檢查、人工審核、一鍵發布 / 更新 / 下架、社群貼文附文章連結 | 官網版面、sitemap、Search Console |
| Homigo | 收文、存檔、SSR 列表 / 內文、meta、JSON-LD、sitemap、robots | 生成、二次審核 |

Homigo 會存一份已發布內容。GO 行銷中心暫時掛掉，官網文章仍可讀。

---

## 4. 用既有功能生成（不要重做）

### 4.1 生成前必備三包

缺任何一包，不得生成。

| 包 | 來源模組 | 必含 |
|---|---|---|
| 品牌包 | 品牌智慧（當前已發布 Brand Version） | 定位、受眾、內容支柱、規則邊界、CTA、關鍵訊息 |
| 關鍵字包 | Google 關鍵字搜尋 | 主關鍵字 1 個 + 相關詞 6–12 個 + 搜尋意圖 |
| 話題包 | 市場情報 或 熱點主題庫 | 要嘛綁 `market_signal`，要嘛標 `evergreen` + 支柱題 |

`brand_keywords`（Hashtag / CTA / 關鍵訊息）是品牌用語，**不是** Google 搜尋量詞。兩者都進 prompt，用途不同：

- 品牌用語：語氣、CTA、可宣稱內容
- Google 關鍵字：選題、標題、文首答案、內文相關詞

### 4.2 各模組怎麼用

**讓文章寫對**

| 模組 | 用法 |
|---|---|
| 品牌智慧 | 生成必載入當前已發布版本。標題語氣、價格、未上線功能，全部以規則為準 |
| 規則邊界 | 生成後自動檢查 `can_claim` / `cannot_claim` / `negative_rule`。違規擋下或標紅，才能進審閱 |
| 平台調性 | 新增 `website`：繁中、專業但不生硬、800–1800 字、H2/H3、文末 LINE CTA |
| 內容支柱 | 每篇只掛一個。列表分類對齊：痛點共鳴、產品教學、政策時事、信任案例、互動話題 |
| 持續學習 | 當建議注入 prompt（哪些支柱 / CTA 較有效），不改品牌定位 |

**讓文章能被搜到、有話題**

| 模組 | 用法 |
|---|---|
| Google 關鍵字搜尋 | 主關鍵字 1 個寫進 `seo_title`、`seo_description`、文首答案、一個 H2。相關詞 6–12 個自然寫進內文，不堆標題 |
| 市場情報 | 政策時事文必須綁一筆 `market_signal`（相關性建議 ≥ 0.6）。沒熱點就寫 Evergreen，不硬蹭 |
| 熱點主題庫 | 熱點先對品牌自己的題庫，再對當日新聞 |
| AI 會議室 | 爭議政策、跨品牌長文先開會再寫 |
| 品牌合作 | 聯名文只讀 brief，不互讀完整 Brand Knowledge |

**發布**

| 模組 | 用法 |
|---|---|
| 內容中心 | `content_type = article`，走既有審閱。`seo_meta` 必填見 §7 |
| 發布管理 | 新增平台 `website`。批准後建立 Publishing Job，呼叫 Homigo upsert，回寫 `public_url` |
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
  → 發布管理 website → PUT Homigo ingest
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
| 2 | 相關詞場景 | 接下來 2–3 段，把 6–12 個相關詞寫進真實場景。讓主題被看懂，不是重複主詞 |
| 3 | 展開說明 | H2/H3、步驟、對照表、注意事項。小標用問句或完整短句 |
| 4 | FAQ | 3–5 題。問句接近搜尋原話，答案 2–4 句、可獨立被摘 |
| 5 | 品牌與 CTA | Homigo / LINE 放最後。不要開頭先廣告 |

官網頁面也照這個順序渲染：答案區 → 內文 → FAQ → CTA。JSON-LD 會帶 `Article` + `FAQPage`。

禁止：

- 開頭只寫故事
- 相關詞全擠標題
- 同一句重複堆主關鍵字
- FAQ 空話（「歡迎詢問」「視情況而定」）
- 開頭先推 Homigo / 加 LINE

### 5.1 相關詞怎麼寫

主關鍵字不要只出現一次，也不要每段都貼同一個詞。

例：主關鍵字「房東收租」

相關詞應自然出現：催繳、逾期、對帳、繳租紀錄、LINE 通知、未付款、收租率、每月帳單。

錯誤：標題寫「房東收租、房東收租管理、房東收租系統、房東收租 App」。  
正確：文首先答「房東收租怎麼管」，內文用催繳、逾期、對帳把場景講完。

優先選搜尋意圖是「想了解／想解決」的詞，不要只堆品牌名「Homigo」。

### 5.2 website 平台調性

- 語言：繁體中文（台灣用語）
- 性格：專業但不生硬、有溫度、務實
- 少講技術名詞，多講省心、透明、留痕、一條龍
- 正文 800–1800 字（不含 FAQ）
- 至少 3 個 H2
- 文末 CTA：加入 LINE 官方帳號 `@933pdush`

---

## 6. 分類與支柱

每篇只選一個 `category`：

| category | 對應支柱 | 何時用 |
|---|---|---|
| `pain` | 痛點共鳴 | 收租、報修、對帳、押金日常問題 |
| `product` | 產品教學 | 單一功能怎麼用、解決什麼 |
| `policy` | 政策時事 | 必須綁 `market_signal_id` |
| `trust` | 信任案例 | 流程、留痕、里程碑。不捏造用戶數字 |
| `talk` | 互動話題 | 可上官網的知識向；投票文較適合社群，不要硬發官網 |

時事守則：只蹭租屋、居住、修繕、AI、生活。政治、災難、爭議只提供資訊協助，不消費事件。政策用中立說明 + 產品如何幫得上忙。

---

## 7. 欄位規格

發布到 Homigo 的 payload。`external_id` 建議用 GO 行銷中心的 `contents.id`。

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
| `cta` | string | — | 文末行動，須含 LINE `@933pdush` 或 lin.ee 連結 |
| `status` | string | `published` | upsert 時表示要上架 |
| `published_at` | string | ISO 8601 | 台北時間對應的時間戳 |

### 7.2 選填

| 欄位 | 型別 | 說明 |
|---|---|---|
| `cover_image_url` | string | 只收 `https`。Homigo 不代傳檔 |
| `og_image_url` | string | 預設用封面 |
| `tags` | string[] | 最多 8 個，給列表篩選 |
| `author` | string | 預設 `Homigo` |
| `market_signal_id` | string | `category = policy` 時必填 |
| `brand_version_id` | string | 生成當下品牌版本，供追溯 |
| `pillar` | string | 內容支柱名稱 |

### 7.3 `seo_meta`（內容中心存檔）

```json
{
  "slug": "landlord-rent-collection",
  "seo_title": "房東收租怎麼管？催繳、逾期與對帳一次看懂",
  "seo_description": "房東收租不必再用 Excel 跟人追。這篇說明催繳、逾期、對帳與 LINE 通知怎麼一次看完。",
  "primary_keyword": "房東收租",
  "related_terms": ["催繳", "逾期", "對帳", "繳租紀錄", "LINE 通知", "未付款", "收租率", "每月帳單"],
  "search_intent": "solution"
}
```

### 7.4 slug 規則

- 只允許小寫英文、數字、連字號
- 反映主關鍵字語意，例如 `landlord-rent-collection`
- 不用日期、不用中文、不連續 `--`
- 已發布後若改 slug，舊網址會 404。需要改請先下架再發新篇，或與 Homigo 約好 301（本期不做）

---

## 8. Homigo Ingest API

Homigo 端上線後會補正式 base URL。對方可先依本 schema mock。

Base（待上線後填入）：

```
https://housego-api.homigo.workers.dev
```

認證：每個請求帶

```
X-Go-Marketing-Key: <雙方約定的 shared secret>
```

沒有 key、key 錯：`401`。

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
    "slug": "landlord-rent-collection",
    "status": "published",
    "public_url": "https://www.homigo.com.tw/blog/landlord-rent-collection"
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
| 400 | 缺必填、slug 格式錯、相關詞不足 6 個、FAQ 不足 3 題、`answer_box` 過短、policy 沒綁 market_signal |
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
  "slug": "landlord-rent-collection",
  "title": "房東收租怎麼管？催繳、逾期與對帳一次看懂",
  "description": "房東收租常卡在催繳與對帳。這篇用催繳、逾期、繳租紀錄與 LINE 通知，說明怎麼一次看完。",
  "seo_title": "房東收租怎麼管？催繳、逾期與對帳一次看懂",
  "seo_description": "房東收租不必再用 Excel 跟人追。這篇說明催繳、逾期、對帳與 LINE 通知怎麼一次看完。",
  "primary_keyword": "房東收租",
  "related_terms": ["催繳", "逾期", "對帳", "繳租紀錄", "LINE 通知", "未付款", "收租率", "每月帳單"],
  "search_intent": "solution",
  "category": "pain",
  "answer_box": "房東收租，指每月向房客收取租金、留下繳租紀錄，並在逾期時催繳、月底對帳。做得到的做法有三：固定出每月帳單、逾期自動提醒、入帳與房號對得上。少用人追、少用 Excel 重抄，收租率才看得到。",
  "body_md": "## 房東收租逾期怎麼催？\n\n……（800–1800 字，含相關詞場景與至少 3 個 H2）……",
  "faq": [
    {
      "question": "房東收租逾期要怎麼催繳？",
      "answer": "先看繳租紀錄確認是否未付款，再發一次提醒。催繳要留時間與內容，避免口頭對口頭。"
    },
    {
      "question": "收租對帳要對哪些項目？",
      "answer": "每月帳單金額、實際入帳、房號與月份。對不上再查是否逾期或短付。"
    },
    {
      "question": "可以用 LINE 通知房客繳租嗎？",
      "answer": "可以。到期前提醒、逾期催繳都走同一管道，房客與房東看得到同一筆紀錄。"
    }
  ],
  "cta": "想把催繳、逾期與對帳放在同一處，加入 Homigo LINE 官方帳號 @933pdush，免費開始、不綁信用卡。",
  "cover_image_url": "https://example.com/cover.jpg",
  "og_image_url": "https://example.com/cover.jpg",
  "tags": ["收租", "房東", "對帳"],
  "author": "Homigo",
  "market_signal_id": null,
  "brand_version_id": "homigo-v12",
  "pillar": "痛點共鳴",
  "status": "published",
  "published_at": "2026-09-18T08:00:00+08:00"
}
```

---

## 9. 品牌與事實邊界

生成與審閱都必須遵守。來源：品牌智慧當前版本 + Homigo 品牌檔。

可宣稱：

- 「不是管理房子，而是讓房子自己運作。」
- 「每天只需要看一眼。」
- 「免費開始，不綁信用卡。」
- 「依 Homigo 目前市場調查，為包租代管軟體首創的 TaskGo 串接」（必須帶此前綴）

不可宣稱：

- 市佔率第一、未提供的用戶數字、「保證」「100%」「最便宜」
- 未上線功能當現有功能
- 自行編造方案價格（官網方案以官網為準；本文不另報價）
- 把 TaskGo / Washgo 說成 Homigo 自有品牌
- 暗示可逃漏稅、違建出租或規避法規

語調避免：恐嚇行銷、貶低競品、誇大。

---

## 10. CTA 與社群導流

- 文末才出現品牌與 LINE。主要 CTA：加入 `@933pdush`。
- 次要可連回官網對應區塊（方案、加入、使用教學）。
- 同一主題若發 Threads / IG / FB，貼文必須附 `public_url`，把權重導回官網。
- 社群貼文仍走各平台調性（短、圖卡、口語），不要貼整篇長文。

---

## 11. Homigo 官網會做的事（對方不用做）

- `/blog` 列表、`/blog/{slug}` SSR
- 頁面順序：答案區 → 內文 → FAQ → CTA
- `title`、`description`、canonical、OG、Twitter Card
- JSON-LD：`Article` + `FAQPage`
- `/sitemap.xml`、`/robots.txt`
- 首頁導覽「租屋知識」
- 下架後列表與 sitemap 移除

對方不用做官網版面、不必 iframe、不必自己產 sitemap。

---

## 12. 驗收標準

GO 行銷中心做完以下項目即算本規格達標：

1. `publishing_platform` 新增 `website`
2. 官網長文生成必須同時載入品牌包、關鍵字包、話題包
3. 生成結果含 `answer_box`、相關詞 6–12、FAQ 3–5、固定正文順序
4. 規則邊界檢查通過才能進審閱
5. 人工批准後才呼叫 Homigo `PUT`
6. 發布成功後 UI 顯示 `public_url`
7. 更新走同一 `PUT`；下架走 `unpublish`
8. 同主題社群貼文帶官網文章 URL
9. 一支測試文走通：發布 → 官網看得到 → 改文 → 官網更新 → 下架 → 官網消失

Homigo 側對應驗收（本 repo，不在本次 GO 實作範圍）：ingest API、`/blog`、sitemap。API base URL 上線後補進本文 §8。

---

## 13. 不做

- Homigo 後台二次審核
- 把研討會新聞稿搬進 `/blog`
- 官網全文搜尋
- 自動送 Google Indexing API（上線後人工提交 Search Console）
- 用 iframe 掛 GO 行銷中心頁面
- 把社群短文當官網長文發布

---

## 14. 雙方聯絡與後續

1. GO 行銷中心依本文實作生成與 `website` 頻道（可先 mock Homigo API）。
2. Homigo 實作 ingest 與 `/blog` 後，把 base URL 與 key 交換方式補進 §8。
3. 用 §12 第 9 條測試文對打一次。
4. 正式量產前，先發 1 篇 Evergreen 測收錄，再發政策時事文。
