---
name: go-pain-shorts
description: >-
  把 TaskGo／Washgo（也可 Homigo）系統操作錄影剪成 60–75 秒 9:16「痛點行銷短片」：
  LINE 痛點情境 → 用了之後 → 系統畫面放大運鏡 → 圓滿結局 → 片尾，台灣腔配音（edge-tts 曉雨）、
  OCR 自動馬賽克、字幕、音效配樂，並產出 IG/FB、Threads、YouTube Shorts 文案。
  使用者說「功能痛點短片」「優化短片」「系統功能短影片」「用 go-shorts」時使用。
  （操作教學片用 go-ops-sop-video；Podcast 切片用 go-short-video-editor）
---

> 工具程式在 `tools/go-shorts/`。所有指令先 `cd tools/go-shorts && source .venv/bin/activate`（第一次先 `bash setup.sh`）。
> 下文的路徑（gs.py、projects/、inputs/、output/）都是相對於 `tools/go-shorts/`。
> 這份是唯一的正式說明；`tools/go-shorts/SKILL.md` 只是指回這裡。


# go-shorts｜系統功能痛點短影片（標準作業）

給 AI 助手（Cursor / Claude）照做的說明書。使用者只要給：**一段系統操作錄影＋一句痛點大綱**（例：「工班老闆永遠在猜哪個案場收錢了沒…用了之後一看就知道」），就照下面流程做出一支 60–75 秒的短片和社群文案。

成品規格（不要改，除非使用者要求）：1080×1920、30fps、H.264、AAC 192k、響度 -14 LUFS；配音一定是**台灣腔**（微軟 edge-tts `zh-TW-HsiaoYuNeural` 曉雨，語速 +8%、再加速 1.1 倍）。

---

## 0. 第一次使用（只做一次）

```bash
cd ~/Desktop/go_marketing/tools/go-shorts
bash setup.sh          # 建 .venv、裝套件（edge-tts、rapidocr、opencv、imageio-ffmpeg…）
source .venv/bin/activate
python gs.py all projects/_測試/smoke.json   # 安裝測試，不需要錄影，約 1 分鐘
```
之後每次開新終端機都先 `source .venv/bin/activate`。
`setup.sh` 會優先用 Homebrew 的 Python 3.11／3.12（macOS 內建 3.9 裝 opencv 會卡很久）。

## 系列短片（TaskGo × Washgo 系統優勢）

`python gs.py series` 會列出每一集的狀態（⏳ 等錄影／📝 草稿已出／🎬 錄影到位／✅ 成片）。
每集的 json 已寫好痛點情境、配音、字幕、結局、片尾與社群文案；`_record` 欄位寫著**要錄哪些畫面**，系統畫面（screen 場景）的 `src`／`cam` 是暫定值，錄影後要依 probe/frame 重新填。

| 品牌 | 集數 | 主題（說明文件依據 `docs/help/<品牌>/`） |
|---|---|---|
| TaskGo | 01 結案報告 | 需要一筆已產生的結案報告（不能代為產生），暫緩 |
| TaskGo | 02 打卡出勤 | new-dashboard、daily-summary、attendance-report |
| TaskGo | 03 財務成本 | financial-overview、cost-overview、cost |
| TaskGo | 04 派工行事曆 | office-dispatch、crew-linebot-work |
| TaskGo | 05 施工回報審核 | ai/task-review（審核資料包） |
| TaskGo | 06 叫料倉儲 | office-warehouse、crew-liff-material（帳號無叫料單，暫緩） |
| TaskGo | 07 估價簽名 | office-customers-quotations、client-quotation-sign（帳號無報價單，暫緩） |
| TaskGo | 08 修繕管理 | office-repair |
| TaskGo | 09 維護合約 | office-maintenance、office-engineering（帳號無維護期數，暫緩） |
| TaskGo | 10 薪資請假 | office-payroll-leave、crew-liff-leave（帳號無請假／薪資資料，暫緩） |
| TaskGo | 11 OWNER 駕駛艙 | owner-dashboard |
| Washgo | 01 收件報價簽名 | walkin、checkin、quote（後台） |
| Washgo | 02 司機今日任務 | dispatch、return-dispatch、store-pickup、driver-schedule（後台派車版） |
| Washgo | 03 訂單即時進度 | orders、訂單詳情、store-pickup（後台查詢版） |
| Washgo | 04 品管重洗 | staff-qc |
| Washgo | 05 點數儲值 | points-policy、points-topup、customers、points-topup-report |
| Washgo | 06 營運中心開班 | staff-operations、staff-walkin-inbox |

### 用真實帳號唯讀截圖（`capture.py`）

沒有錄影時，用 `projects/<品牌>/<集>.capture.json` 列出要看的頁面，`capture.py` 用本機 Chrome 登入、每張截圖停 4 秒接成 `inputs/<品牌>-<主題>.mp4`，第 N 張截圖就是第 `(N-1)*4` 到 `N*4` 秒：

```bash
TASKGO_USER=… TASKGO_PASS=… python capture.py projects/taskgo/02-打卡出勤.capture.json
```

- 帳密只放環境變數，不寫進任何檔案；截圖在 `inputs/shots/`，不進 git。
- 登入後 PUT／PATCH／DELETE 一律擋下，POST 記在 `inputs/shots/<集>/_requests.log`，拍完要檢查。按鈕文字像「新增、儲存、刪除、確認、通過」會拒絕點擊；只想看空白表單時才加 `safe_view`。
- 每張截圖會順便存 `_NN.txt`（頁面文字），可用來抽出客戶姓名當 `pii.patterns`；名單類頁面（客戶管理）要用 `pii.manual` 整欄遮。
- 出片後每 2 秒抽一張放大框檢查，漏遮的補 `pii.manual` 再出一次。

新增一集：複製同品牌最像的一集改編號與內容，台詞裡的功能一定要能在 `docs/help/<品牌>/` 找到依據。

**還沒錄影也能先審腳本**：`plan`／`still`／`sheet`／`render` 加 `--draft`，系統畫面改顯示「🎬 待錄影」佔位卡（標出功能名與錄影秒數），成片檔名是 `<title>_草稿.mp4`。手機直式錄影的集數在 `source.draft_size` 設 `[1179, 2556]`，草稿版面才會跟正式版一致。錄影放進 `inputs/` 後拿掉 `--draft` 正式輸出。

**每集只能有一個錄影檔、一種方向**：同一集需要電腦和手機畫面時，手機那段改用 `chat` 場景示意（例如 TaskGo 04 的 LINE 今日工作），或把兩段都錄成同一方向再接成一支，用 `src` 秒數切段。

## 1. 資料夾

```
go-shorts/
  gs.py              ← 所有指令的入口
  engine/            ← 渲染引擎（一般不用改）
  brands/            ← 品牌設定：taskgo.json、washgo.json（logo、吉祥物、主色、CTA）
  projects/<品牌>/   ← 每支影片一份設定檔 .json（腳本＋分鏡＋運鏡＋文案）
  inputs/            ← 放錄影檔
  output/<品牌>/<專案>/ ← 成片 mp4、社群文案.md、檢查用圖
  fonts/ assets/     ← 思源黑體 TW、品牌圖
```
範例（照著改最快）：`projects/taskgo/01-結案報告.json`（直式手機錄影）、`02-打卡出勤.json`、`03-財務成本.json`（橫式電腦錄影）。

## 2. 每支影片的流程

### 步驟 1｜看錄影，找重點畫面
```bash
python gs.py probe inputs/<錄影>.mov        # 每秒一張縮圖 → output/_probe/<錄影>/probe_*.jpg
python gs.py frame inputs/<錄影>.mov 12 27.5 # 抓原尺寸畫面＋座標格線，用來決定鏡頭框
```
打開 probe 圖，列出：每個功能畫面出現在第幾秒到第幾秒、哪裡有個資（人名、電話、地址、公司名、案名、LINE 名稱、網址代碼）。
**避開快速捲動的段落**（文字在動，馬賽克容易漏）；挑畫面靜止、重點數字清楚的 1.5–5 秒。

### 步驟 2｜寫腳本（照這個結構）
1. **痛點 2–4 場**（LINE 對話／通知轟炸／手寫表格），每場一句配音。用老闆的口吻、台灣口語、有畫面感（「已讀不回」「調頭寸、跑銀行」「月底算薪水」）。
2. **轉場**：`用了 TaskGo，一切都不一樣！`（title 場景）
3. **系統價值 4–6 場**（screen 場景），每場一個功能、一句配音：「功能名＋好處」，例「收款提醒自動跳出來，哪一期過期幾天、金額多少，一看就知道」。
4. **圓滿結局 1 場**（客戶／會計回覆、或泡茶選案子），呼應痛點。
5. **片尾**：一句品牌金句，例「TaskGo，讓每一個案場，都賺得明明白白！」

台詞規則：
- 每句 12–35 字，唸起來 3–8 秒；整支配音合計 45–65 秒。
- **台灣用語**：影片（不是視頻）、品質（質量）、訊息（信息）、軟體（軟件）、上傳、手機、師傅、案場、工班、老闆。
- 字幕（`sub`）每行 ≤ 14 字、最多 2 行，`{重點}` 會變黃色；不寫 `sub` 會自動從配音切兩行。字幕可以比配音精簡，但意思一致。
- **不要捏造系統沒有的功能**。LINE 對話、人名、金額都是情境示意（用假名：阿豪、林師傅、王小姐、會計小美）。

### 步驟 3｜寫設定檔 `projects/<品牌>/<編號>-<功能>.json`
複製最像的範例改。場景格式見下方第 3 節。鏡頭框座標用步驟 1 的 `frame` 格線圖決定。

### 步驟 4｜產生配音、掃個資、檢查
```bash
python gs.py tts   projects/taskgo/04-xxx.json   # 台灣腔配音（有快取，改台詞才會重做）
python gs.py ocr   projects/taskgo/04-xxx.json   # 掃錄影裡的個資 → 會印出「被遮的文字」清單
python gs.py plan  projects/taskgo/04-xxx.json   # 每個場景的起訖秒數
python gs.py still projects/taskgo/04-xxx.json 3 10 25 40   # 看指定秒數的成品畫面
```
- 看 `ocr` 印出的清單：**人名、公司、案名、地址、電話都要在裡面**。沒抓到的 → 加到 `pii.patterns`（正規表示式片段，例 `"陳"`、`"興峰"`），重跑 `ocr`。被誤遮的 → 加到 `pii.ignore`。OCR 讀不到的（頭像、圖示）→ 用 `pii.manual` 指定秒數範圍＋方框。
- `still` 的圖要真的打開來看：字幕有沒有超出、貼圖有沒有擋到重點、鏡頭框有沒有框在空白處。

### 步驟 5｜輸出與最後檢查
```bash
python gs.py render projects/taskgo/04-xxx.json      # 成片 + 社群文案.md（約 5–10 分鐘）
python gs.py sheet  projects/taskgo/04-xxx.json      # 每秒一張縮圖，逐張確認馬賽克
```
想先快速看節奏可以 `render ... --preview`（畫質較低、比較快）。
成片在 `output/<品牌>/<專案>/<title>_短影片.mp4`。

## 3. 設定檔格式

```jsonc
{
  "brand": "taskgo",                 // brands/ 裡的檔名
  "title": "TaskGo財務成本",          // 成片檔名
  "source": { "file": "inputs/taskgo-財務成本.mov",
              "inpaint_circles": [[1162,1352,104]] },   // 選填：把 iPhone 小白點等圓形擦掉 [x,y,半徑]
  "pii": { "patterns": ["陳","林家","兆基"],   // 要遮的字（另外內建：電話、地址、先生/小姐）
           "ignore": ["燈號"],                 // 不要遮的字
           "keep": ["發票"],                   // 含這些字但沒命中 patterns 的就保留
           "manual": [{"from":14.2,"to":21.6,"box":[650,815,880,880]}] },  // 錄影秒數＋原始像素方框
  "voice": { "name": "zh-TW-HsiaoYuNeural", "rate": "+8%", "tempo": 1.1 },
  "scenes": [ ... ],                  // 依序播放
  "social": { "ig": "...", "threads": "...", "yt_title": "...", "yt_desc": "..." }
}
```

**每個場景共用欄位**：`type`、`vo`（配音台詞，一場一句）、`sub`（字幕，選填）、`min`（最短秒數）、`banner`（上方標籤 `{"text","color"}`）、`stickers`（貼圖：`{"at","text","color","y","style":"stamp"|"pill","until","sfx"}`）、`emojis`（`{"emoji","at","x","y","size","wobble"}`）、`sfx`（`[[秒, 音效名, 音量]]`）。
`at` 一律是「從這個場景開始算的秒數」。場景長度自動 = 配音長度＋0.45 秒（或最後一個動畫結束）。
顏色可用：red green orange blue purple yellow line gray，或 `[r,g,b]`。
音效名：pop tick whoosh boing slide_down crash zap dun_dun coin cash ding sparkle scratch bugle huh wah_wah camera（大部分會自動加，不用寫）。

| type | 用途 | 主要欄位 |
|---|---|---|
| `chat` | LINE 對話 | `title`（聊天室名）、`messages`：`{"at","side":"l/r","who","avatar","text","ts","read_at"}`；`kind:"date"` 日期、`kind:"call"` 未接來電、`kind:"card"` 通知卡（`header,kicker,sub,rows:[[k,v]],buttons,color1,color2`）、`kind:"rating"` 評價卡、`kind:"photos"`（`photos:[{"t":秒,"box":[x0,y0,x1,y1]}]` 從錄影截圖）。`at:-1` = 一開始就已經在畫面上（延續上一場）。`avatar`：`"mascot"` 品牌吉祥物、`"bot"` 品牌 logo、或一個字。`zoom_into:{"at","x","y"}` 結尾點擊放大轉場 |
| `notifs` | 手機通知轟炸 | `clock`、`bg`（purple/red/green/warm/blue）、`items:[{"icon":"LINE"或emoji,"icon_color","who","msg"}]`、`interval`、`face:{"emoji","at"}` |
| `sheet` | 手寫表格（出勤、成本…） | `title`、`columns`、`rows:[{"name","cells":[...]}]`；cell `"v"`=✅、`"?"`/`"???"`=紅色問號、其他文字照寫；`reveal:"col"/"row"`、`step` |
| `title` | 「用了 X 之後」轉場 | `vo`、`tagline`（橘色小標）；`text` 可改大字 |
| `screen` | 系統錄影＋運鏡 | `tag`（左上功能名）、`src:[開始秒,結束秒]`、`cam:[[cx,cy,w],[cx,cy,w]]`（起點→終點鏡頭）；或 `segments:[{"src","cam","share"}]` 多段；`chips:[{"at","text","color"}]` 步驟標籤；`pii_window`（馬賽克前後沿用秒數，預設 0.2） |
| `cards` | 圓滿結局／比較卡 | `bg`、`cards:[{"title","label","value","tone":1/0/-1}]`、`pick`（第幾張被選）、`pick_text`、`pick_at` |
| `end` | 片尾 | `lines:["工地財務","{看得懂・管得住}"]`、`chips`（最多 6 個）、`cta`（預設用品牌的） |

**鏡頭 `cam:[cx, cy, w]`**（座標都是錄影原始像素）：
- 直式手機錄影：整個畫面就是鏡頭，`w` = 要裁的寬度（高度自動 16:9）。全畫面 = 錄影寬度；放大 = 寬度變小（建議不小於原寬 75%）。
- 橫式電腦錄影：上方自動放整頁縮圖＋橘框，下方是放大框（約 1000×690）。`w` 是放大框涵蓋的原始寬度：**900–1500 字才看得清楚**，超過 2000 就只是總覽。
- 起點寬一點、終點收到重點數字上（例如毛利率、金額、過期天數）。

## 4. 社群文案（寫在設定檔的 `social`，render 時輸出 `社群文案.md`）

- `ig`（IG／FB 主貼文）：第一行痛點＋emoji → 3–4 個痛點條列 → 「用了 X，…👇」→ 5–6 個功能條列（emoji 開頭，一行一個）→ 一句收尾金句 → `👉 私訊我們…` → 10 個左右 hashtag（品牌設定檔有預設 hashtag）。
- `threads`：口語短文 5–7 行，不用條列、不放 hashtag，像老闆在發牢騷再帶出解法。
- `yt_title`：痛點問句＋emoji＋「｜品牌 功能名」，40 字內。
- `yt_desc`：2–3 句說明＋4–5 個 hashtag，含 `#Shorts`。
- 行動呼籲統一「私訊我們」，不要寫不存在的優惠或試用方案。

## 發佈到行銷中心（簡報專區＋品牌素材庫）

成片確認後，在 `tools/go-shorts` 執行：

```bash
.venv/bin/python publish.py --check   # 先輸出截圖到 output/_publish/，逐張看有沒有漏遮的個資
.venv/bin/python publish.py           # 寫進網站
```

- 新的一集要先加進 `publish.py` 的 `EPISODES`（英文 id、功能名），英日文標題補在 `src/data/system-shorts.ts`。
- 產生 `public/shorts/<品牌>/<id>.mp4`（720×1280 網頁版）與封面、`public/brands/<品牌>/shorts/` 每個系統畫面一張截圖（不含字幕），清單在 `src/data/system-shorts.json`。
- `/briefings` 依品牌分組顯示；打開品牌素材庫時截圖自動寫進素材格（名稱開頭「系統短影片｜」），B 端 FB／IG 配圖優先用。用這些截圖產的 IG 貼文會以 Reels 發這支短片、Facebook 發粉專影片。Threads 不排這支影片。
- 截圖畫面靠近邊緣、被切一半的電話 OCR 抓不到，`--check` 時特別看畫面底部，漏的用 `pii.manual` 補框後重新 render。

## 5. 常見問題

- **配音唸錯字**：改台詞用字（同音字、加標點斷句），`tts` 會自動重做那一句。專有名詞想唸成英文就寫英文（TaskGo、LINE、GPS、Excel）。
- **場景太長／整支超過 75 秒**：刪掉一個 screen 場景，或把 `voice.tempo` 調到 1.15。
- **字幕太長**：自動縮小到最小 46 號字；更長就自己改短 `sub`。
- **馬賽克漏遮**：`sheet` 找出秒數 → `frame` 抓那一秒看座標 → 加 `pii.manual` 或 `pii.patterns`。捲動很快的段落盡量不要用。
- **新品牌**：在 `brands/` 複製一份 json 改 logo、吉祥物、主色、CTA，`assets/` 放圖。
- 錄影檔很大沒關係，不用先轉檔；影片超過 30MB 要上傳社群前可以用剪映或手機再壓。
