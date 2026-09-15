# Threads App Review 送審稿 + manage_replies 測試呼叫

系統內可翻：登入後側邊欄 **內容營運 → Threads 申請手冊**（`/settings/meta-threads`）。
畫面與錄影在 `public/docs/meta/`，部署後路徑 `/docs/meta/`。

App：`1050575724086471`（WashgoMarketing，Access the Threads API）
Business ID：`2534843870320856`
本次送審：`10505757075132`
後台：https://developers.facebook.com/apps/1050575724086471/use_cases/customize/?use_case_enum=THREADS_API&selected_tab=permissions
產品：https://go-marketing-center.pages.dev
隱私政策：https://go-marketing-center.pages.dev/privacy
資料刪除：同一頁「資料刪除方式」／ `service@inforcraft.com.tw`

一次送兩個權限：`threads_keyword_search`、`threads_manage_replies`。
廣告 API、WhatsApp 使用案例可略過，不擋 Threads 送審。

2026-09-15：Threads 五個權限測試都已綠（basic / content_publish / manage_insights / keyword_search / manage_replies）。正在填資料處理與權限說明。

---

## 一、`threads_manage_replies` 測試呼叫（先做，點亮綠點）

發文、回自己文，Meta 多半算 `threads_content_publish`，**不會**點亮 `threads_manage_replies`。
要打的是官方的隱藏／取消隱藏留言：[Reply management](https://developers.facebook.com/documentation/threads/reference/reply-management)

準備：一支已連線的品牌 Threads（例如 Washgo）、token 有勾 `threads_basic` + `threads_manage_replies` + `threads_read_replies`。
自己那則貼文底下**至少要有 1 則留言**。沒有的話，用另一個已加進 App 測試人員的 Threads 帳號去留一句「test」。

### A. 用 Graph API Explorer（建議）

1. 開 https://developers.facebook.com/tools/explorer/
2. 右上角 **Meta App** 選這個 Threads 應用（ID `1050575724086471`）
3. 若有 **Host / Graph 網域**，選 `graph.threads.net`（不要用 `graph.facebook.com`）
4. **User or Page** 選 Threads 使用者；按 **Generate Access Token**
5. 權限至少勾：
   - `threads_basic`
   - `threads_read_replies`
   - `threads_manage_replies`
6. 授權完成後，用同一個 Explorer 依序打下面三個請求。

**第 1 步：列出自己最近貼文**

| 欄位 | 填什麼 |
|---|---|
| Method | `GET` |
| Path | `me/threads` |
| Query 參數 `fields` | `id,text,permalink,timestamp` |
| Query 參數 `limit` | `5` |

按 Submit。複製一則「底下已有留言」的 `id`（長數字字串），下面稱 `{POST_ID}`。

**第 2 步：列出該則貼文的留言**

| 欄位 | 填什麼 |
|---|---|
| Method | `GET` |
| Path | `{POST_ID}/replies` |
| Query 參數 `fields` | `id,text,username,timestamp` |

按 Submit。複製其中一則留言的 `id`，下面稱 `{REPLY_ID}`。  
若 `data` 是空的，先去那則 Threads 留言，再打一次。

**第 3 步：這一步才算 `threads_manage_replies` 測試呼叫**

| 欄位 | 填什麼 |
|---|---|
| Method | `POST` |
| Path | `{REPLY_ID}/manage_reply` |
| Body 參數名 | `hide` |
| Body 參數值 | `false` |

`hide=false` = 取消隱藏，畫面幾乎不變。不要用 `true`，免得把真實留言藏起來。

成功會長得像：

```json
{ "success": true }
```

回到使用案例 → 權限 → `threads_manage_replies` → 要求。  
「1 次成功的 API 測試呼叫」可能要 **1–2 天** 才變綠。這 30 天內送審才算數。

### B. Explorer 選不到 Threads 時，用 curl

把 `{TOKEN}`、`{POST_ID}`、`{REPLY_ID}` 換掉。不要把 token 貼到聊天或 commit。

```bash
# 1. 自己的貼文
curl -s "https://graph.threads.net/v1.0/me/threads?fields=id,text,permalink,timestamp&limit=5&access_token={TOKEN}"

# 2. 該則留言
curl -s "https://graph.threads.net/v1.0/{POST_ID}/replies?fields=id,text,username,timestamp&access_token={TOKEN}"

# 3. 測試呼叫（點亮綠點）
curl -s -X POST "https://graph.threads.net/v1.0/{REPLY_ID}/manage_reply" \
  -F "hide=false" \
  -F "access_token={TOKEN}"
```

Token 在行銷中心「社群帳號 → Threads → 測試連線」用的同一把長效權杖即可；若 400 權限不足，重新走 Threads 授權視窗，一定要勾 `threads_manage_replies`。

---

## 二、送審說明（中文，可貼進 App Review）

### 應用程式是做什麼的

GO 行銷中心是品牌內部的行銷營運後台，只給 Homigo、TaskGo、Washgo 的授權小編使用，不是給一般消費者下載的 App。小編用帳號密碼登入 https://go-marketing-center.pages.dev ，在「Threads 工作台」審核並發布內容、回覆公開討論。

### 為什麼需要 threads_keyword_search

我們用官方 Keyword Search，依產業關鍵字（例如租屋、裝修、洗衣）搜尋**公開** Threads 貼文，讓小編看到行業相關討論。系統會產生回覆草稿，預設由小編按「發」才會送出；若小編開啟自動回覆，才在每小時／每日上限內自動發布。未過審前這個權限只能搜到自己的文，所以我們申請進階存取，才能搜公開熱門文。我們不搜私密帳號，不存密碼，不把搜尋結果賣給第三方。

### 為什麼需要 threads_manage_replies

小編核准後，系統透過官方 API 把回覆發到該則公開貼文（`reply_to_id`）。同一個權限也用來管理品牌自己貼文底下的留言（例如取消隱藏）。所有回覆受小時與每日上限限制，並可在工作台關閉自動回覆。

### 審核員怎麼測試

1. 用下方測試帳號登入 https://go-marketing-center.pages.dev
2. 左上角切到任一品牌（建議 Washgo）
3. 左側「內容營運」→「Threads 工作台」
4. 按「立即掃文」，等待搜尋結果
5. 對一則結果按產回覆／「發」（開發模式可能只搜到自己的文，屬預期；過審後同一畫面會出現別人的公開文）
6. 可到「社群帳號」查看 Threads 已連線、自動回覆開關與額度

### 測試帳號（請自行填入後再送）

- 登入網址：https://go-marketing-center.pages.dev
- 測試小編帳號：＿＿＿＿
- 測試小編密碼：＿＿＿＿
- 已連線的 Threads 帳號：＿＿＿＿（須為 App 測試人員，並在手機 Threads「設定 → 帳號 → 網站權限」接受邀請）

### 隱私與刪除

- Privacy Policy URL：https://go-marketing-center.pages.dev/privacy
- Data Deletion Instructions URL：https://go-marketing-center.pages.dev/privacy
- 聯絡信箱：service@inforcraft.com.tw（30 天內刪除已存資料）

### 資料處理問題（可對照勾選／填空）

對照畫面：`/docs/meta/06-data-handling-processors.png`、`07-data-handling-controller.png`、`08-data-handling-national-security.png`

| 欄位 | 怎麼填 |
|---|---|
| processor-0 是否有處理者／供應商可存取平台資料（含自己公司） | **是**。列出：商家驗證上的法定公司全名；Cloudflare, Inc.；Neon, Inc.；OpenAI, L.L.C. |
| responsible-1 誰負責 Meta 分享的平台資料 | **商家驗證上的法定公司全名**（例如 ○○○有限公司）。不要填 Washgo／匠管／GO 行銷中心 |
| 國家／實體類型 | Taiwan／台灣；**法人** |
| requestso-3 過去 12 個月是否因國家安全把用戶資料交給公家機關 | **否** |

- 誰能使用：僅品牌授權員工，不是公開下載的消費 App
- 向使用者收集什麼：管理者登入帳密（我方系統）；經授權的 Threads 使用者 ID、帳號名稱、access token
- 從 Threads API 讀什麼：公開貼文 ID、原文、作者帳號、permalink；自己貼文的留言；發布結果
- 用途：搜尋行業公開討論、產生回覆草稿、經審核或額度內發布、成效分析
- 是否賣給第三方：否
- 是否給廣告再行銷：否
- Token 怎麼存：AES-256-GCM 加密後存資料庫，僅後端解密
- 保存多久：帳號連接期間；搜尋快照僅供檢視所需期間；生成圖片最多 31 天
- 使用者怎麼撤銷：Threads「設定 → 帳號 → 網站權限」移除本應用；或來信刪除
- 使用的子處理者：Meta（Threads API）、OpenAI（只送產稿所需上下文）、Cloudflare、Neon

---

## 三、Submission notes (English, paste into App Review)

### What the app does

GO Marketing Center is an internal marketing console for authorized editors of Homigo, TaskGo, and Washgo. It is not a consumer-facing downloadable app. Editors sign in at https://go-marketing-center.pages.dev and use the Threads Desk to review, schedule, and publish brand posts and replies.

### Why we need threads_keyword_search

We call the official Threads Keyword Search API with industry keywords (rentals, renovation, laundry) to find **public** posts. The app drafts a reply. By default a human editor must tap Send. If the editor enables auto-reply, drafts publish only within hourly and daily caps. Before advanced access, Keyword Search only returns the authenticated user's own posts; we request advanced access so the same desk can find public posts. We do not search private accounts, store passwords, or sell search results.

### Why we need threads_manage_replies

After an editor approves a draft (or auto-reply is on), we publish the reply to that public post via the official reply API (`reply_to_id`). We also use this permission to manage replies on our own posts (for example unhide). Replies are rate-limited and auto-reply can be turned off in the desk.

### How to test

1. Sign in at https://go-marketing-center.pages.dev with the reviewer account below.
2. Switch to a brand (Washgo recommended).
3. Open Content ops → Threads Desk.
4. Click Scan now and wait for results.
5. Generate a reply and tap Send. In development mode results may be our own posts; that is expected. After approval the same UI shows other people's public posts.
6. Social accounts shows the connected Threads profile, auto-reply toggle, and caps.

### Reviewer login (fill in before submit)

- URL: https://go-marketing-center.pages.dev
- Editor username: ________
- Editor password: ________
- Connected Threads handle: ________ (must be an app tester and must accept the invite in Threads → Settings → Account → Website permissions)

### Privacy

- Privacy Policy: https://go-marketing-center.pages.dev/privacy
- Data Deletion Instructions: https://go-marketing-center.pages.dev/privacy
- Contact: service@inforcraft.com.tw (we delete stored data within 30 days)

### Data handling (short answers)

- Audience: authorized brand staff only
- Data from users: staff login; authorized Threads user id, username, access token
- Data from Threads: public post id, text, username, permalink; replies on our posts; publish receipts
- Use: discover public industry posts, draft replies, publish after review or within caps, analytics
- Sold to third parties: no
- Ads retargeting: no
- Token storage: AES-256-GCM at rest, decrypted only on the server
- Retention: while the account stays connected; search snapshots only as long as editors need them; generated images up to 31 days
- Revocation: Threads Settings → Account → Website permissions, or email us
- Subprocessors: Meta, OpenAI (draft context only), Cloudflare, Neon

---

## 四、螢幕錄影講稿（約 2–3 分鐘）

中文旁白可照念：

「這是 GO 行銷中心，品牌小編後台。我用測試帳號登入。進入 Washgo 的 Threads 工作台。按立即掃文，系統呼叫官方 Keyword Search。現在 App 還在開發模式，所以先搜到自己的文。小編可以改回覆、按發送。發送是走官方回覆 API。過審後，同一頁會出現別人的公開熱門文，流程不變。小編可以關掉自動回覆，全部改人工按發送。隱私政策在 go-marketing-center.pages.dev/privacy。」

English voiceover:

“This is GO Marketing Center, an internal editor console. I sign in with the reviewer account. I open Washgo → Threads Desk and click Scan now. That calls official Keyword Search. In development mode we only see our own posts. The editor can edit the draft and tap Send, which uses the official reply API. After App Review the same screen shows other people's public posts. Auto-reply can be turned off. Privacy policy: go-marketing-center.pages.dev/privacy.”

錄影要看得到瀏覽器網址列、登入成功、掃文結果、送出回覆。

系統內可播：
- `/docs/meta/threads-desk-screencast.mp4`（桌面「Threads自動發文影片.mov」，2026-09-15，可上傳給 Meta）
- `/docs/meta/threads-setup-screencast.mp4`（桌面「螢幕錄影 2026-09-14 上午11.16.21.mov」，申請動作對照）

---

## 五、權限說明欄可貼稿（2026-09-15 表單原文）

### threads_manage_replies（畫面 `04-manage-replies-justification.png`）

```
GO 行銷中心是 Homigo、TaskGo、Washgo 的內部行銷後台，只給授權小編使用，不是給一般消費者下載的 App。登入網址：https://go-marketing-center.pages.dev

我們使用 threads_manage_replies 做兩件事，都走官方 API，沒有爬蟲：
1. 小編在「Threads 工作台」核准回覆稿後，系統用 reply_to_id 把回覆發到該則公開貼文（包含回覆自己貼文底下的留言）。沒有這個權限就無法代品牌帳號留言。
2. 管理品牌自己貼文底下的留言（例如取消隱藏），維持公開討論品質。

價值：小編不必開 Threads App 逐則複製貼上，可在同一頁改稿、審核、發送，並用每小時／每日上限避免洗版。自動回覆可隨時關閉，預設需人工按「發」。

我們只處理公開內容與品牌已授權帳號；不讀私訊、不賣資料、不用於廣告再行銷。Token 加密存放。隱私與刪除說明：https://go-marketing-center.pages.dev/privacy ，聯絡 service@inforcraft.com.tw。
```

### threads_keyword_search（畫面 `05-keyword-search-justification.png`，你正在填的這一頁）

```
GO 行銷中心是 Homigo、TaskGo、Washgo 的內部行銷後台，只給授權小編使用，不是給一般消費者下載的 App。登入網址：https://go-marketing-center.pages.dev

我們使用 threads_keyword_search 呼叫官方 Keyword Search API，依產業關鍵字搜尋公開 Threads 貼文，例如：租屋／房東房客（Homigo）、裝修／工班／漏水（TaskGo）、洗衣／換季／發霉（Washgo）。搜尋結果只顯示給該品牌小編，系統會產生回覆草稿。

價值：小編不必自己在 Threads 手動搜熱門文。同一頁即可看到相關公開討論、改稿、審核後發送。未過審前此權限只能搜到自己的文，工作台回覆區會是空的；申請進階存取後，同一流程才能搜到別人的公開文。

預設需小編按「發」才會留言。若開啟自動回覆，也只在每小時／每日上限內發送，可隨時關閉。我們只搜公開內容，不搜私密帳號，不把搜尋結果出售、出租或用於廣告再行銷。Token 加密存放。隱私與刪除說明：https://go-marketing-center.pages.dev/privacy ，聯絡 service@inforcraft.com.tw。
```

兩頁都要：上傳同一支 2–3 分鐘錄影、勾最下面同意格、按繼續。

---

## 六、過審後接品牌（不要另開 App）

三品牌共用 WashgoMarketing。新品牌：

1. 本系統設定裡建立登入帳號並指定品牌
2. 開發模式把該品牌 Threads 加進 App 測試人員，手機 Threads「設定 → 帳號 → 網站權限」接受邀請
3. 授權視窗勾 `threads_basic`、`threads_content_publish`、`threads_keyword_search`、`threads_manage_replies`（成效再加 `threads_manage_insights`）
4. 換成 60 天長效 token，貼到該品牌「社群帳號」，按測試連線
5. Threads 工作台「立即掃文」能看到別人的公開文，回覆佇列才會有東西

過審前 token 要重走授權。`API access blocked` 先完成開發者帳號驗證。
