# TaskGo 客服文件匯入對照

品牌：`taskgo`。到 GO 行銷中心 `/:brand/help` → 客服文件分頁，逐檔上傳後勾角色、填畫面路徑、核對正文、按發布。

只發布已抽取成功的檔。標題可空白（會用檔名）。畫面路徑只填下表主路徑，不要填帶 id 的動態網址。

## 上傳清單

| 檔名 | 適用角色 | 畫面路徑 | 建議標題 |
|---|---|---|---|
| office-login-workspace.md | office | /workspace | 登入與工作台 |
| office-organize-staff.md | office | /staff | 組織與人員 |
| office-project.md | office | /project | 專案管理 |
| office-dispatch.md | office | /dispatch | 派工行事曆 |
| office-task-records.md | office | /task-records | 派工紀錄與審核 |
| office-improvement.md | office | /improvement-tasks | 改善任務 |
| office-daily-attendance.md | office | /daily-summary | 每日報表與出勤 |
| office-engineering.md | office | /engineering-settings | 工程設置 |
| office-customers-quotations.md | office | /quotations | 客戶與估價單 |
| office-cost-finance.md | office | /cost | 成本與財務 |
| office-warehouse.md | office | /material-requisitions | 倉儲與叫料 |
| office-freight.md | office | /freight-planner | 運費管理 |
| office-payroll-leave.md | office | /payroll | 薪資與請假 |
| office-repair.md | office | /repair-admin | 修繕管理 |
| office-maintenance.md | office | /maintenance | 維護合約 |
| office-moving.md | office | /moving-admin | 搬家管理 |
| office-customer-accounts.md | office | /customer-accounts | 客戶帳號 |
| office-subscription.md | office | /payments | 訂閱與付款 |
| office-linebot-invite.md | office | /line-bot-invite | 邀請工班加入 LINE |
| office-mobile.md | office | /mobile | 後勤手機版 |
| crew-linebot-join.md | crew | /line-bot-invite | 工班加入 LINE |
| crew-linebot-work.md | crew | /mobile/tasks | LINE 報工與完工 |
| crew-mobile.md | crew | /mobile | 工班手機版 |
| crew-repair-work.md | crew | /repair-work | 場勘與施工回報 |
| crew-repair-status.md | crew | /repair-crew-status | 工班查修繕進度 |
| crew-liff-leave.md | crew | /liff/leave-request | 請假申請 |
| crew-liff-material.md | crew | /liff/material-requisition | 叫料與材料檢查 |
| client-customer-view.md | client | /customer-view | 業主查看專案 |
| client-repair-login.md | client | /repair-client | 修繕案件登入查詢 |
| client-repair-sign.md | client | /repair-doc | 報價與驗收簽名 |
| client-quotation-sign.md | client | /contractor-ai-quotation | 智能報價簽名 |
| client-freight-sign.md | client | /freight-sign | 運費結算簽名 |

## 嵌入設定（工程師）

origin 白名單建議：

- `https://app.taskgo.com.tw`
- `https://dev.taskgo.com.tw`
- `http://localhost:5173`
- `https://liff.line.me`

更換 widget key 後，產品前端的 `VITE_GO_HELP_WIDGET_KEY` 也要改（本機 `.env.development`／`.env.production`、Cloud Build `_VITE_GO_HELP_WIDGET_KEY`、GitHub secret `VITE_GO_HELP_WIDGET_KEY`）。

## 試問

後勤（office，頁路徑 `/dispatch`）

1. 有文件：「我要怎麼新增一筆派工？」應引用派工行事曆。
2. 無文件：「今天股價多少？」應說實話並出現請客服聯繫我。
3. 換角色：同一題用 crew 試問，不應講後勤左側選單。

工班（crew，頁路徑 `/repair-work`）

1. 有文件：「場勘照片要怎麼上傳？」應引用場勘回報。
2. 無文件：「幫我改合約金額」應說實話並留資。
3. 換角色：同一題用 office 試問，不應只講工班手機連結。

業主（client，頁路徑 `/repair-doc`）

1. 有文件：「報價單要怎麼簽名？」應引用簽名頁。
2. 無文件：「我的案號進度到哪」應說實話（小幫手不查真實案件）並留資。
3. 換角色：同一題用 office 試問，不應教業主進修繕管理後台。
