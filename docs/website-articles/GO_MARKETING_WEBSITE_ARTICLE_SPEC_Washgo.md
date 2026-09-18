# Washgo 官網 SEO 長文串接規格

> 給：GO 行銷中心（gomkt2026 / go-marketing-center）  
> 來自：Washgo（washgo / washgo.com.tw）  
> 版本：v1.0  
> 日期：2026-09-18  
> 官網：https://washgo.com.tw  
> 行銷中心：https://go-marketing-center.pages.dev/  
> 品牌事實來源：[WASHGO_BRAND_MARKETING.md](./WASHGO_BRAND_MARKETING.md)  
> Washgo 端實作：[WEBSITE_SEO_ARTICLES.md](./WEBSITE_SEO_ARTICLES.md)

本文是雙方契約。GO 行銷中心依此生成、審核、發布官網長文；Washgo 依此收文並在官網輸出可被 Google / AI 搜尋收錄的 HTML。不要另做一套生成器，沿用既有品牌智慧、Google 關鍵字、市場情報、內容中心、發布管理。

與 Homigo 官網長文規格**共用同一套 payload 與發布流程**。品牌切到 Washgo、平台選 `website` 時，改呼叫 Washgo ingest，不要複製一份生成器。

---

## 1. 目標

在 Washgo 官網新增「洗衣知識」文章區，讓 Google 與 AI 搜尋（Google AI 總覽、ChatGPT、Gemini）收得到 Washgo 內容，把流量導回 `washgo.com.tw`。

公開 URL：

| 頁面 | URL |
|---|---|
| 列表 | `https://washgo.com.tw/blog` |
| 內文 | `https://washgo.com.tw/blog/{slug}` |

發布後立刻上架，Washgo **不再二次審核**。

預設受眾比重與品牌聖經一致：**B2C 消費者 70%、B2B 洗衣業者 30%**。官網長文以消費者搜尋為主；業者文可以發，但不要佔列表前排。

---

## 2. 原則（必讀）

1. **官網是第 5 個發布頻道，但內容類型是長文。** 不可把 Threads / IG / FB / X 短文原樣貼上官網。現行四平台短文規格不變。
2. **文章必須活在 washgo.com.tw。** 不可 iframe GO 行銷中心。Google 與 AI 只會把內容算在實際輸出 HTML 的網域。
3. **沿用現有八大模組。** 品牌智慧 → 市場情報 →（可選）AI 會議室 → 決策 → Campaign → 內容生成 → 內容中心審閱 → 發布管理。只新增 / 沿用 `publishing_platform = website`，目的地依當前品牌切換。
4. **AI 協助，人決定。** 生成後必須人工審閱才能呼叫 Washgo。AI 不得自行發布。
5. **品牌知識不互混。** Washgo 文只載入 Washgo 已發布 Brand Version。跨品牌（Washgo × Homigo、Washgo × TaskGo、或加盟品牌聯名）只能用 Collaboration Brief。
6. **SEO 效果來自「好摘 + 相關詞」，不是標題堆字。** 現行搜尋會先讓 AI 讀頁、摘一段、再推播。機器好收集的答案必須放最前面；相關詞要寫進內文場景。
7. **Washgo 是衣物洗滌／乾洗，不是洗車。** 任何生成內容不得出現洗車聯想。品牌名寫 `Washgo`，不寫 WashGo / WASHGO / washgo。
8. **只能引用品牌聖經標為「✅ 產品事實」的內容。** 「⚠️ 行銷宣稱」數字（如 5,000+ 客戶、98% 滿意度）不得寫進官網長文。

---

## 3. 職責

| 端 | 負責 | 不負責 |
|---|---|---|
| GO 行銷中心 | 選題、生成、編輯、規則檢查、人工審核、一鍵發布 / 更新 / 下架、社群貼文附文章連結 | 官網版面、sitemap、Search Console |
| Washgo | 收文、存檔、列表 / 內文 HTML、meta、JSON-LD、sitemap、robots | 生成、二次審核 |

Washgo 會存一份已發布內容。GO 行銷中心暫時掛掉，官網文章仍可讀。

---

## 4. 用既有功能生成（不要重做）

### 4.1 生成前必備三包

缺任何一包，不得生成。

| 包 | 來源模組 | 必含 |
|---|---|---|
| 品牌包 | 品牌智慧（當前已發布 Brand Version）+ [WASHGO_BRAND_MARKETING.md](./WASHGO_BRAND_MARKETING.md) | 定位、受眾、內容支柱、規則邊界、CTA、關鍵訊息 |
| 關鍵字包 | Google 關鍵字搜尋 | 主關鍵字 1 個 + 相關詞 6–12 個 + 搜尋意圖 |
| 話題包 | 市場情報 或 熱點主題庫 | 要嘛綁 `market_signal`，要嘛標 `evergreen` + 支柱題 |

`brand_keywords`（Hashtag / CTA / 關鍵訊息）是品牌用語，**不是** Google 搜尋量詞。兩者都進 prompt，用途不同：

- 品牌用語：語氣、CTA、可宣稱內容
- Google 關鍵字：選題、標題、文首答案、內文相關詞

品牌用語優先用品牌聖經第 5.2 節與第 9.1 節：輕鬆搞定、交給 Washgo、全程透明、專屬洗滌管家、到府收送、GoCoin、AI 洗護建議。固定 Hashtag 只給社群用，不要塞進官網標題。

### 4.2 各模組怎麼用

**讓文章寫對**

| 模組 | 用法 |
|---|---|
| 品牌智慧 | 生成必載入當前已發布版本。標題語氣、價格、未上線功能，全部以規則與品牌聖經為準 |
| 規則邊界 | 生成後自動檢查 `can_claim` / `cannot_claim` / `negative_rule`。違規擋下或標紅，才能進審閱 |
| 平台調性 | 沿用 `website`：繁中、專業但不生硬、800–1800 字、H2/H3、文末 CTA。Washgo 消費者文末導 LINE `@washgo`；業者文末導 `hello@washgo.com.tw` |
| 內容支柱 | 每篇只掛一個。列表分類對齊：痛點共鳴、產品教學、政策時事、信任案例、洗護知識 |
| 持續學習 | 當建議注入 prompt（哪些支柱 / CTA 較有效），不改品牌定位 |

**讓文章能被搜到、有話題**

| 模組 | 用法 |
|---|---|
| Google 關鍵字搜尋 | 主關鍵字 1 個寫進 `seo_title`、`seo_description`、文首答案、一個 H2。相關詞 6–12 個自然寫進內文，不堆標題 |
| 市場情報 | 政策時事文必須綁一筆 `market_signal`（相關性建議 ≥ 0.6）。沒熱點就寫 Evergreen，不硬蹭 |
| 熱點主題庫 | 熱點先對品牌聖經第 8 章主題庫，再對當日新聞。優先：換季、梅雨、羽絨、面試西裝、出國髒衣、寵物毛屑、嬰兒衣、永續少買多護 |
| AI 會議室 | 爭議政策、跨品牌長文、涉及價格或未上線功能時先開會再寫 |
| 品牌合作 | 聯名文只讀 brief，不互讀完整 Brand Knowledge。不得把加盟品牌名當背書，除非營運另行核准 |

**發布**

| 模組 | 用法 |
|---|---|
| 內容中心 | `content_type = article`，走既有審閱。`seo_meta` 必填見 §7 |
| 發布管理 | 沿用平台 `website`。當前品牌 = Washgo 時，批准後建立 Publishing Job，呼叫 Washgo upsert，回寫 `public_url` |
| Dashboard | 可多一列「待發官網長文」（Washgo / Homigo 分開列） |

### 4.3 建議生成流程

```
選題（Google 關鍵字 + 市場情報 / 熱點庫 + 內容支柱）
  → 必要時 AI 會議室
  → 管理者批准題目
  → 載入品牌包 + 關鍵字包 + 話題包
  → 生成（固定正文順序，見 §5）
  → 規則邊界檢查
  → 內容中心人工審閱
  → 發布管理 website → PUT Washgo ingest
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
| 5 | 品牌與 CTA | Washgo / LINE / Email 放最後。不要開頭先廣告 |

官網頁面也照這個順序渲染：答案區 → 內文 → FAQ → CTA。JSON-LD 會帶 `Article` + `FAQPage`。

禁止：

- 開頭只寫故事
- 相關詞全擠標題
- 同一句重複堆主關鍵字
- FAQ 空話（「歡迎詢問」「視情況而定」）
- 開頭先推 Washgo / 加 LINE
- 出現洗車、汽車美容、車體鍍膜等聯想
- 把社群口語氣的短帖直接拉長當正文

### 5.1 相關詞怎麼寫

主關鍵字不要只出現一次，也不要每段都貼同一個詞。

例：主關鍵字「到府收送洗衣」

相關詞應自然出現：到府收衣服、洗衣店上班時間、LINE 下單、衣物追蹤、乾洗、羽絨外套、週末衣服山、48 小時。

錯誤：標題寫「到府收送洗衣、到府收送洗衣店、到府收送洗衣推薦、到府收送洗衣 App」。  
正確：文首先答「到府收送洗衣怎麼用」，內文用上班時間對不上、週末衣服山、LINE 下單把場景講完。

優先選搜尋意圖是「想了解／想解決」的詞，不要只堆品牌名「Washgo」。

### 5.2 website 平台調性

- 語言：繁體中文（台灣用語）
- 性格：對消費者親切 7 分、專業 3 分；可以幽默，不可以輕浮
- 對業者：專業 7 分、親切 3 分；談效率與省心，不畫大餅
- 少講技術名詞（LIFF、Worker、SaaS），多講省心、透明、不用出門、確認才洗
- 正文 800–1800 字（不含 FAQ）
- 至少 3 個 H2
- 消費者文末 CTA：加入 LINE 官方帳號 `@washgo`（`https://line.me/R/ti/p/@washgo`）
- 業者文末 CTA：寫信 `hello@washgo.com.tw` 或回官網品牌介紹，**不得**把後台登入當主 CTA

### 5.3 受眾 `audience`

選填。沒填預設 `consumer`。

| audience | 何時用 | 文末 CTA |
|---|---|---|
| `consumer` | 一般洗衣、洗護、到府、追蹤、GoCoin | `@washgo` |
| `merchant` | 洗衣店數位轉型、多門市、派車、導流 | `hello@washgo.com.tw` |

列表預設先顯示 `consumer`。`merchant` 文可發，但不要連續佔最新三篇。

---

## 6. 分類與支柱

每篇只選一個 `category`。值與 Homigo 相同，方便 GO 行銷中心沿用既有欄位；語意改成洗衣。

| category | 對應支柱 | 何時用 |
|---|---|---|
| `pain` | 痛點共鳴 | 週末衣服山、洗衣店時間對不上、進度不透明、怕洗壞、價格說不清 |
| `product` | 產品教學 | 到府收送、門市送洗、LINE 下單、AI 洗護、衣物追蹤、GoCoin、智慧衣櫃 |
| `policy` | 政策時事 | 必須綁 `market_signal_id`。梅雨、換季、環保、能源、勞動或居住政策碰到洗衣場景時才寫 |
| `trust` | 信任案例 | 品管、電子簽名、25+ 節點追蹤、線上報價確認才洗。不捏造既有用戶數字 |
| `talk` | 洗護知識與互動話題 | 羽絨、西裝、洗標、材質保養、穿搭。投票文較適合社群，不要硬發官網 |

時事守則：只蹭洗衣、洗護、換季、梅雨、穿搭、AI、生活、傳產數位轉型。政治、宗教、災難傷亡只提供資訊協助，不消費事件、不做促銷。政策用中立說明 + 產品如何幫得上忙。

品牌聖經第 8 章主題庫對照：

| 主題庫 | 建議 category |
|---|---|
| 換季收納、梅雨發霉、冬衣羽絨、面試西裝、出國髒衣、寵物毛屑、嬰兒衣、家事分工 | `pain` 或 `talk` |
| 到府收送、LINE 下單、追蹤、AI 洗護、GoCoin、智慧衣櫃 | `product` |
| 數位轉型政策、加盟創業 | `product` + `audience = merchant` |
| 品管、簽名、透明追蹤 | `trust` |
| 當日新聞且相關性夠 | `policy` |

---

## 7. 欄位規格

發布到 Washgo 的 payload。`external_id` 建議用 GO 行銷中心的 `contents.id`。

欄位與 Homigo 官網長文規格對齊。Washgo 多一個選填 `audience`。

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
| `cta` | string | — | 文末行動。消費者文須含 `@washgo` 或 `line.me/R/ti/p/@washgo`；業者文須含 `hello@washgo.com.tw` |
| `status` | string | `published` | upsert 時表示要上架 |
| `published_at` | string | ISO 8601 | 台北時間對應的時間戳 |

### 7.2 選填

| 欄位 | 型別 | 說明 |
|---|---|---|
| `cover_image_url` | string | 只收 `https`。Washgo 不代傳檔 |
| `og_image_url` | string | 預設用封面 |
| `tags` | string[] | 最多 8 個，給列表篩選 |
| `author` | string | 預設 `Washgo` |
| `audience` | string | `consumer`（預設）或 `merchant` |
| `market_signal_id` | string | `category = policy` 時必填 |
| `brand_version_id` | string | 生成當下品牌版本，供追溯 |
| `pillar` | string | 內容支柱名稱 |

### 7.3 `seo_meta`（內容中心存檔）

```json
{
  "slug": "home-pickup-laundry",
  "seo_title": "到府收送洗衣怎麼用？不用遷就洗衣店上班時間",
  "seo_description": "到府收送洗衣不用再請假去送衣服。這篇用 LINE 下單、衣物追蹤與週末衣服山，說明司機上門取件、洗好送回怎麼一次看完。",
  "primary_keyword": "到府收送洗衣",
  "related_terms": ["到府收衣服", "洗衣店上班時間", "LINE 下單", "衣物追蹤", "乾洗", "羽絨外套", "週末衣服山", "48 小時"],
  "search_intent": "solution"
}
```

### 7.4 slug 規則

- 只允許小寫英文、數字、連字號
- 反映主關鍵字語意，例如 `home-pickup-laundry`、`how-to-wash-down-jacket`
- 不用日期、不用中文、不連續 `--`
- 已發布後若改 slug，舊網址會 404。需要改請先下架再發新篇，或與 Washgo 約好 301（本期不做）

---

## 8. Washgo Ingest API

Washgo 端上線後會確認正式 base URL。對方可先依本 schema mock。

Base：

```
https://washgo-api.washgotaskgo.workers.dev
```

認證：每個請求帶

```
X-Go-Marketing-Key: <雙方約定的 shared secret>
```

沒有 key、key 錯：`401`。

### 8.1 發布或更新

```
PUT /v1/integrations/gomarketing/articles
```

同一 `external_id` 再 PUT = 更新，官網立刻改內容，sitemap `lastmod` 更新。

成功 `200`：

```json
{
  "success": true,
  "article": {
    "external_id": "content-uuid",
    "slug": "home-pickup-laundry",
    "status": "published",
    "public_url": "https://washgo.com.tw/blog/home-pickup-laundry"
  }
}
```

發布管理 UI 必須顯示 `public_url`，標示「已發佈連結」。

### 8.2 下架

```
POST /v1/integrations/gomarketing/articles/{external_id}/unpublish
```

成功後：列表與 sitemap 消失；該 slug 回 404 或 410。

### 8.3 錯誤碼

| HTTP | 情況 |
|---|---|
| 400 | 缺必填、slug 格式錯、相關詞不足 6 個、FAQ 不足 3 題、`answer_box` 過短、policy 沒綁 market_signal、CTA 沒含 `@washgo` 或業者信箱 |
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
  "slug": "home-pickup-laundry",
  "title": "到府收送洗衣怎麼用？不用遷就洗衣店上班時間",
  "description": "到府收送洗衣常卡在「店開門我在上班」。這篇用 LINE 下單、衣物追蹤與週末衣服山，說明司機上門取件、洗好送回怎麼安排。",
  "seo_title": "到府收送洗衣怎麼用？不用遷就洗衣店上班時間",
  "seo_description": "到府收送洗衣不用再請假去送衣服。這篇用 LINE 下單、衣物追蹤與週末衣服山，說明司機上門取件、洗好送回怎麼一次看完。",
  "primary_keyword": "到府收送洗衣",
  "related_terms": ["到府收衣服", "洗衣店上班時間", "LINE 下單", "衣物追蹤", "乾洗", "羽絨外套", "週末衣服山", "48 小時"],
  "search_intent": "solution",
  "category": "pain",
  "audience": "consumer",
  "answer_box": "到府收送洗衣，指司機到指定地址取走要洗的衣服，洗好再送回，全程不必自己跑洗衣店。做得到的做法有三：用 LINE 下單選到府收送、收件後先看線上報價再確認、用衣物追蹤看洗到哪一步。週末衣服山不必再等人有空。",
  "body_md": "## 洗衣店上班時間對不上怎麼辦？\n\n……（800–1800 字，含相關詞場景與至少 3 個 H2）……",
  "faq": [
    {
      "question": "到府收送洗衣要自己在家等很久嗎？",
      "answer": "下單時先約取件時段。司機到了會依流程收件並留下紀錄，不必整晚空等，也不必請假去對上洗衣店開門時間。"
    },
    {
      "question": "衣服送出去要怎麼追蹤？",
      "answer": "每件衣物都有狀態追蹤，從取件、門市覆核、洗滌到品管回貨，變化會推到 LINE。不用一直打電話問洗好了沒。"
    },
    {
      "question": "到府收送可以送乾洗或羽絨外套嗎？",
      "answer": "可以。精緻衣物一樣走收件清點與線上報價，確認後才洗。價格以當次報價為準，不會在取件當下才突然開口。"
    }
  ],
  "cta": "想把到府收衣服、線上報價和衣物追蹤放在同一處，加入 Washgo LINE 官方帳號 @washgo，加入即可下單。",
  "cover_image_url": "https://example.com/cover.jpg",
  "og_image_url": "https://example.com/cover.jpg",
  "tags": ["到府收送", "LINE 下單", "衣物追蹤"],
  "author": "Washgo",
  "market_signal_id": null,
  "brand_version_id": "washgo-v1",
  "pillar": "痛點共鳴",
  "status": "published",
  "published_at": "2026-09-18T08:00:00+08:00"
}
```

---

## 9. 品牌與事實邊界

生成與審閱都必須遵守。來源：品牌智慧當前版本 + [WASHGO_BRAND_MARKETING.md](./WASHGO_BRAND_MARKETING.md) 第 0、3、6、9、10 章。

可宣稱（✅ 產品事實）：

- 「衣物送洗，交給 Washgo」
- 「到府收送、門市送洗、門市自取」
- 「LINE 下單，免下載 App」
- 「25+ 節點即時追蹤，狀態推播到 LINE」
- 「收件後線上報價，確認同意才開始洗」
- 「專業品管逐件把關，不通過重洗，最多 2 輪」
- 「取件／送返都有電子簽名紀錄」
- 「GoCoin 跨品牌通用、永久不過期，1 點 = NT$1」
- 「AI 洗護建議：拍照辨識材質與洗標」
- 「標準交件時間 48 小時以內（依品項而異，以各店為準）」
- 「免費加入，無月費」（對消費者）
- 「一套平台，串聯整條洗衣鏈」（對業者）

時效性、發文前必須人工確認：

- 「加入 `@washgo` 領 100 GoCoin」
- 「首次送洗享 9 折」

不可宣稱：

- 市佔率第一、全台最大／唯一、未提供的用戶數字（含官網硬編碼的 5,000+ 客戶、98% 滿意度）
- 「保證不縮水」「保證洗掉所有污漬」「絕對零糾紛」「100%」「最便宜」
- 醫療級、殺菌 99.9%、ISO 或未提供的環保標章
- 未上線功能當現有功能
- 自行編造方案或品項價格（只能說線上報價、確認才洗）
- 列舉加盟品牌名稱當背書（官網品牌目錄含示範資料時也一樣）
- 把 Homigo / TaskGo / 各加盟店說成 Washgo 自有洗衣工廠
- 出現洗車、汽車美容等聯想
- 在消費者文提 SaaS 月費、抽成、品牌結算
- 暗示可逃漏稅或規避法規

語調避免：恐嚇行銷、貶低競品、誇大、輕浮。

標準用詞見品牌聖經第 9.1 節：到府收送（不用宅配洗衣）、AI 洗護建議（不寫 AI 洗衣）、GoCoin（不寫 Go Coin）。

---

## 10. CTA 與社群導流

- 文末才出現品牌與行動按鈕。
- 消費者主 CTA：加入 `@washgo`（`https://line.me/R/ti/p/@washgo`）。
- 業者主 CTA：`hello@washgo.com.tw`。不得把 `washgo.pages.dev/login` 當文章主 CTA。
- 次要可連回官網對應區塊（送洗方式、GoCoin、品牌目錄）。
- 同一主題若發 Threads / IG / FB / X，貼文必須附 `public_url`，把權重導回官網。
- 社群貼文仍走各平台調性（短、圖卡、口語），不要貼整篇長文。
- 每篇只放 1 個主 CTA。

---

## 11. Washgo 官網會做的事（對方不用做）

- `/blog` 列表、`/blog/{slug}` 由 `washgo.com.tw` 輸出 HTML
- 頁面順序：答案區 → 內文 → FAQ → CTA
- `title`、`description`、canonical、OG、Twitter Card
- JSON-LD：`Article` + `FAQPage`
- `/sitemap.xml`、`/robots.txt`
- 首頁導覽與頁尾「洗衣知識」
- 下架後列表與 sitemap 移除

對方不用做官網版面、不必 iframe、不必自己產 sitemap。

現行官網行銷頁是靜態輸出；文章區會改由 Washgo 伺服端輸出 HTML，讓搜尋引擎與 AI 收到完整正文。這不影響 GO 行銷中心的發布契約。

---

## 12. 驗收標準

GO 行銷中心做完以下項目即算本規格達標：

1. `publishing_platform = website` 在品牌 = Washgo 時呼叫 Washgo ingest（不要打到 Homigo）
2. 官網長文生成必須同時載入品牌包、關鍵字包、話題包
3. 生成結果含 `answer_box`、相關詞 6–12、FAQ 3–5、固定正文順序
4. 規則邊界檢查通過才能進審閱；洗車、未核實數字、絕對化承諾要擋下
5. 人工批准後才呼叫 Washgo `PUT`
6. 發布成功後 UI 顯示 `public_url`
7. 更新走同一 `PUT`；下架走 `unpublish`
8. 同主題社群貼文帶官網文章 URL
9. 一支測試文走通：發布 → 官網看得到 → 改文 → 官網更新 → 下架 → 官網消失

Washgo 側對應驗收（本 repo，見 [WEBSITE_SEO_ARTICLES.md](./WEBSITE_SEO_ARTICLES.md)）：ingest API、`/blog`、sitemap。API key 交換方式上線後補進本文 §8。

---

## 13. 不做

- Washgo 後台二次審核
- 把新聞稿、招募啟事、系統更新公告搬進 `/blog`
- 官網全文搜尋（本期）
- 自動送 Google Indexing API（上線後人工提交 Search Console）
- 用 iframe 掛 GO 行銷中心頁面
- 把社群短文當官網長文發布
- 在長文報具體品項價格
- 把後台登入連結當消費者 CTA

---

## 14. 雙方聯絡與後續

1. GO 行銷中心依本文實作生成與 Washgo `website` 目的地（可先 mock Washgo API）。
2. Washgo 實作 ingest 與 `/blog` 後，把 key 交換方式補進 §8。
3. 用 §12 第 9 條測試文對打一次。
4. 正式量產前，先發 1 篇 Evergreen（建議：到府收送洗衣 或 羽絨外套怎麼洗）測收錄，再發政策時事文。
5. 優惠數字以品牌聖經第 6 章為準；活動變更時先改聖經，再讓官網長文引用。
