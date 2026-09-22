# Washgo 客服文件匯入對照

品牌：`washgo`。到 GO 行銷中心 `/:brand/help` → 客服文件分頁，按「同步官方操作文件（19 份）」即可覆蓋並發布。也可逐檔上傳後勾角色、填畫面路徑、核對正文、按發布。

只發布已抽取成功的檔。標題可空白（會用檔名）。畫面路徑必須與產品端 `normalizeGoHelpPagePath` 一致（動態段是 `:id`，不含 `?brandId=`）。

## 上傳清單

| 檔名 | 適用角色 | 畫面路徑 | 建議標題 |
|---|---|---|---|
| customer-getting-started.md | customer | /customer/register | 第一次使用 |
| customer-register.md | customer | /customer/register | 會員登錄 |
| customer-home-pickup.md | customer | /customer/order/new | 到府送洗預約 |
| customer-store-dropoff.md | customer | /customer/store-dropoff | 門市自助送洗 |
| customer-quote-confirm.md | customer | /customer/order/:id/confirm | 報價確認與簽名 |
| customer-order-progress.md | customer | /customer/order/:id | 訂單進度 |
| customer-points-topup.md | customer | /customer/points | 點數與儲值 |
| staff-join.md | staff | /staff/register | 員工加入與帳號 |
| staff-operations.md | staff | /dashboard/modules/operations | 開班與待辦 |
| staff-walkin-inbox.md | staff | /dashboard/modules/walkin | 收件與受理 |
| staff-checkin.md | staff | /dashboard/modules/checkin | 收貨覆核 |
| staff-quote.md | staff | /dashboard/modules/quote | 報價 |
| staff-qc.md | staff | /dashboard/modules/qc | 品管 |
| staff-store-pickup.md | staff | /dashboard/modules/store-pickup | 回貨與待取件 |
| staff-customers-points.md | staff | /dashboard/modules/points-topup | 客戶與點數 |
| driver-today-tasks.md | driver | /staff/driver/tasks | 今日任務 |
| driver-pickup.md | driver | /staff/driver/tasks | 到府取件 |
| driver-return.md | driver | /staff/driver/return-v2/:id | 配送送回 |
| driver-no-tasks.md | driver | /staff/driver/tasks | 沒有任務時 |

## 嵌入設定（工程師）

origin 白名單建議：

- `https://washgo.pages.dev`
- `https://washgo-liff.pages.dev`
- `https://liff.line.me`
- `http://localhost:3000`
- `http://localhost:3001`

更換 widget key 後，產品前端的 widget `data-key` 也要改。

## 試問

送洗客戶（customer，頁路徑 `/customer/order/new`）

1. 有文件：「我要怎麼預約到府送洗？」應引用到府送洗預約。
2. 無文件：「我這單洗好了沒」應說實話（小幫手不查真實訂單）並留資。
3. 換角色：同一題用 staff 試問，不應只講客人 LINE 選單。

門市員工（staff，頁路徑 `/dashboard/modules/quote`）

1. 有文件：「報價要怎麼做？」應引用報價說明。
2. 無文件：「幫我改這單金額」應說實話並留資。
3. 換角色：同一題用 customer 試問，不應教客人進後台營運中心。

司機（driver，頁路徑 `/staff/driver/tasks`）

1. 有文件：「今天的任務在哪裡看？」應引用今日任務。
2. 無文件：「幫我改路線順序」應說實話並留資。
3. 換角色：同一題用 staff 試問，不應只講司機今日任務時間軸。
