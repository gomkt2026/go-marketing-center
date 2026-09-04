# 三品牌客服 AI 小幫手導入手冊

- 對象：TaskGo／Homigo／Washgo 產品負責人與前端工程師
- 版本：1.1
- 日期：2026-09-04
- 主機：GO 行銷中心（https://go-marketing-center.pages.dev）

小幫手的大腦在 **GO 行銷中心**，產品系統只要嵌一段 script。它只依該品牌、該角色已發布的操作文件回答「怎麼用系統」，**不連接真實案件、合約、訂單**。答不出來或用戶想找人時，可留資進行銷中心的待追蹤工單。

正式 widget 網址：

```
https://go-marketing-center.pages.dev/api/public/help/widget
```

也可寫成 `.../widget.js`，效果相同。

---

## 1. 分工

| 誰 | 做什麼 | 在哪裡做 |
|---|---|---|
| 各品牌負責人 | 上傳／發布客服文件、設歡迎句、看工單 | GO 行銷中心 `/:brand/help` |
| 產品前端 | 在 Web／LIFF 掛 script，依登入身分帶角色 | TaskGo／Homigo／Washgo 各自 repo |
| GO 行銷中心管理者 | 確認 origin 白名單、保管 widget key | 同一頁的「嵌入設定」 |

產品 repo **不要**自己接 OpenAI、不要複製行銷知識庫。

---

## 2. 行銷中心：先讓小幫手有東西可答

登入 [GO 行銷中心](https://go-marketing-center.pages.dev)，切到對應品牌，左側 **品牌經營 → 品牌客服資料庫**。

### 2.1 上傳文件（客服文件分頁）

TaskGo、Homigo 已有官方操作說明。在客服文件分頁按 **同步官方操作文件** 即可覆蓋並發布（TaskGo 32 份、Homigo 21 份）。來源分別是 `docs/help/taskgo`、`docs/help/homigo`。

1. 選 **適用角色**（可多選）。同一份「報修說明」可以同時給房東 + 房客。
2. 上傳 `.md` / `.txt` / `.pdf` / `.docx`（單檔 10MB 內）。舊版 `.doc` 請另存 docx。
3. 標題可空白（會用檔名）。相關畫面路徑選填，例如 `/repairs/new`、`/liff/repair`，之後該頁提問會優先對到這份文件。
4. 系統抽出正文後是 **草稿**。請核對文字，錯字或掃描失敗可直接在框裡改。
5. 按 **發布**。只有已發布、抽取成功的文件會被前台問到。

文件建議用問句當標題，小幫手會拿來當快捷問題：

```markdown
# 報修

## 我要怎麼送出報修？
1. 打開報修
2. 選案件類型
3. 按送出報修

## 送出後要去哪裡看進度？
到「修繕管理」打開剛建立的案件。
```

掃描型 PDF 若抽不到字，狀態會是失敗：請改傳可選文字的 PDF 或 MD。

### 2.2 試問

切到 **試問**，選角色後自己問一遍。沒發布文件時會說沒有說明，並引導留資，這是正常的。

### 2.3 嵌入設定（給工程師的三件事）

1. **複製 script**：頁面上已帶好 `data-brand` 與 `data-key`。
2. **origin 白名單**：一行一個網域。建議至少：
   - TaskGo：`https://app.taskgo.com.tw`
   - Homigo：`https://cc.homigo.workers.dev`，以及實際 LIFF 網域（常見還有 `https://liff.line.me`）
   - Washgo LIFF：實際 LIFF 網域（常見還有 `https://liff.line.me`）
   - 本機：`http://localhost:3000`（或你們的 dev port）
   - 留空 = 不限制來源（上線前請補上，避免被任意網站盜用 key）
3. **各角色歡迎句**（選填）。空白則用系統預設。

「在本頁預覽小幫手」可先在行銷中心看到右下角問號，不必等產品上線。

更換 widget key 後，**所有產品 script 的 `data-key` 都要改**，舊 key 會立刻失效。

---

## 3. 產品系統：嵌一段 script

### 3.1 必要屬性

| 屬性 | 必填 | 說明 |
|---|---|---|
| `src` | 是 | `https://go-marketing-center.pages.dev/api/public/help/widget` |
| `data-brand` | 是 | `taskgo` / `homigo` / `washgo`（小寫） |
| `data-key` | 是 | 該品牌嵌入設定裡的 widget key |
| `data-role` | 是 | 見下方角色表，必須跟當前使用者身分一致 |
| `data-page-path` | 建議 | 目前頁路徑，例如 `/projects/123`；不填則用 `location.pathname` |
| `data-source` | LIFF 必填 | Web 可省略（預設 `web`）；LINE LIFF 請寫 `liff` |

同一頁只掛一次。切換角色或頁面時，請移除舊的 `#go-help-widget` 再掛新的，或整頁重載。

### 3.2 角色代碼（寫錯會 400）

**Homigo**

| 使用者 | `data-role` |
|---|---|
| 房東 | `landlord` |
| 房客 | `tenant` |
| 代管 | `manager` |

**TaskGo**

| 使用者 | `data-role` |
|---|---|
| 後勤／客服／專案 | `office` |
| 工班 | `crew` |
| 業主 | `client` |

**Washgo**

| 使用者 | `data-role` |
|---|---|
| 送洗客戶 | `customer` |
| 門市員工 | `staff` |
| 司機 | `driver` |

角色決定「讀哪一份文件」。房客與房東問同一句，答案可以不同。

---

## 4. 各品牌怎麼掛

### 4.1 TaskGo（Web + 工班連結）

後勤後台（建議掛在 layout，登入後才出現）：

```html
<script
  src="https://go-marketing-center.pages.dev/api/public/help/widget"
  data-brand="taskgo"
  data-role="office"
  data-key="請填入 TaskGo 的 widget key"
  data-page-path="/repairs"
  data-source="web"
></script>
```

工班手機場勘頁若走 LINE／手機瀏覽器：

```html
<script
  src="https://go-marketing-center.pages.dev/api/public/help/widget"
  data-brand="taskgo"
  data-role="crew"
  data-key="請填入 TaskGo 的 widget key"
  data-page-path="/survey/leak"
  data-source="liff"
></script>
```

業主看報價／簽名頁用 `data-role="client"`。

origin 請加：`https://app.taskgo.com.tw`，以及工班實際網域。

### 4.2 Homigo（房東／房客 LIFF 為主）

依 LIFF 登入身分切角色。房客：

```html
<script
  src="https://go-marketing-center.pages.dev/api/public/help/widget"
  data-brand="homigo"
  data-role="tenant"
  data-key="請填入 Homigo 的 widget key"
  data-page-path="/liff/repair"
  data-source="liff"
></script>
```

房東改 `data-role="landlord"`，代管改 `manager`。Web 指揮中心若也要，把 `data-source` 改 `web`，並把 `https://cc.homigo.workers.dev` 加入白名單。

LIFF 注意：

- 一定要 `data-source="liff"`
- 白名單加 LIFF 的 **實際 origin**（瀏覽器開發者工具看 `location.origin`），不要只加官網
- 常還需要 `https://liff.line.me`
- 小幫手已避開雙層 iframe；仍請勿擋右下角固定鈕（約 56px + 16px 邊距）

### 4.3 Washgo（消費者／員工／司機 LIFF）

```html
<script
  src="https://go-marketing-center.pages.dev/api/public/help/widget"
  data-brand="washgo"
  data-role="customer"
  data-key="請填入 Washgo 的 widget key"
  data-page-path="/liff/orders"
  data-source="liff"
></script>
```

門市 `staff`、司機 `driver`。多品牌洗衣後台若是獨立網域，一併加入 origin。

---

## 5. React / Next 建議寫法

script 必須在瀏覽器執行，且 `document.currentScript` 要指到這顆 script。用原生 DOM 插入最穩：

```tsx
import { useEffect } from 'react';

const HELP_SRC = 'https://go-marketing-center.pages.dev/api/public/help/widget';

export function HelpWidget(props: {
  brand: 'taskgo' | 'homigo' | 'washgo';
  role: string;
  widgetKey: string;
  pagePath?: string;
  source?: 'web' | 'liff';
}) {
  useEffect(() => {
    document.getElementById('go-help-widget')?.remove();
    document.querySelectorAll('script[data-go-help]').forEach((n) => n.remove());

    const s = document.createElement('script');
    s.src = HELP_SRC;
    s.async = true;
    s.setAttribute('data-go-help', '1');
    s.setAttribute('data-brand', props.brand);
    s.setAttribute('data-role', props.role);
    s.setAttribute('data-key', props.widgetKey);
    if (props.pagePath) s.setAttribute('data-page-path', props.pagePath);
    if (props.source) s.setAttribute('data-source', props.source);
    document.body.appendChild(s);

    return () => {
      document.getElementById('go-help-widget')?.remove();
      s.remove();
    };
  }, [props.brand, props.role, props.widgetKey, props.pagePath, props.source]);

  return null;
}
```

`widgetKey` 可放各產品的環境變數（例如 `NEXT_PUBLIC_GO_HELP_KEY`）。這是 publishable key，會出現在前端，靠 origin 白名單擋住外站。

路由變更時把 `pagePath` 設成當前 pathname，小幫手會優先找標了該路徑的文件。

---

## 6. 上線檢查清單

**行銷中心**

- [ ] 該品牌至少有一份已發布文件，且角色勾對
- [ ] 試問該角色，答案有引用文件標題
- [ ] 試問文件沒寫的題，會說實話並出現「請客服聯繫我」
- [ ] origin 已加上正式 Web／LIFF 網域
- [ ] 已複製正確的 `data-key`

**產品系統**

- [ ] 右下角出現問號（LIFF 沒被原生 tab 擋住）
- [ ] 開窗歡迎句是對的品牌與角色
- [ ] 問操作題有步驟；亂問或沒文件會引導留資
- [ ] 留資：姓名 + 電話必填，送出後行銷中心「待追蹤」出現一筆
- [ ] 換另一個角色登入，答案不會串到別人的文件

**工單（行銷中心待追蹤）**

- [ ] 預設看「待聯繫」
- [ ] 點開看得到對話快照、電話、角色、頁路徑
- [ ] 可改成已聯繫／已結案，並寫內部備註
- [ ] 第一版不寄信、不推 LINE，客服要自己進系統看

---

## 7. 常見錯誤

| 現象 | 原因 | 處理 |
|---|---|---|
| 開窗寫 widget key 無效 | `data-key` 錯或已更換 | 到嵌入設定複製新 key |
| 此網域尚未開放嵌入 | origin 沒登記 | 把瀏覽器上的 `location.origin` 加進白名單後儲存 |
| 角色無效 | `data-role` 拼錯或用中文 | 只用上表英文代碼 |
| 一直說沒有說明文件 | 沒發布、角色沒勾、或抽取失敗 | 檢查文件狀態與適用角色 |
| 問號沒出現 | script 在 SSR 沒進瀏覽器、或掛了兩次衝突 | 用第 5 節的 `useEffect` 掛載 |
| LIFF 白畫面／雙層捲動 | 誤用 iframe 包小幫手 | 只用官方 script，不要再套 iframe |
| 留資被擋 | 10 分鐘內同一對話重送，或電話格式不對 | 用 09 開頭手機或市話；稍候再送 |

---

## 8. 不要做的事

- 不要讓小幫手讀產品資料庫裡的案件／合約／訂單
- 不要把 Brand Intelligence、社群文案 MD 當成客服文件發布
- 不要三個品牌共用同一份文件或同一個 widget key
- 不要在產品 repo 重做一套客服 AI

答錯就補文件再發布，不必改產品程式。
