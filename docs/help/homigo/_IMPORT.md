# Homigo 客服文件匯入對照

品牌：`homigo`。到 GO 行銷中心 `/:brand/help` → 客服文件分頁，按「同步官方操作文件（21 份）」即可覆蓋並發布。也可逐檔上傳後勾角色、填畫面路徑、核對正文、按發布。

只發布已抽取成功的檔。標題可空白（會用檔名）。畫面路徑只填下表路徑，不要填帶 id 的動態網址。

## 上傳清單

| 檔名 | 適用角色 | 畫面路徑 | 建議標題 |
|---|---|---|---|
| landlord-add-property.md | landlord | /properties, /properties/new | 我要怎麼新增物件？ |
| landlord-invite-tenant.md | landlord | /tenants | 我要怎麼邀請房客、審核綁定？ |
| landlord-lease-sign.md | landlord | /leases, /signatures | 我要怎麼建立租約與電子簽名？ |
| landlord-rent-review.md | landlord | /rent-overview, /payments | 我要怎麼看收租、審核繳租？ |
| landlord-repair.md | landlord | /maintenance, /equipment-events | 房客報修後我要怎麼處理？ |
| landlord-movein-moveout.md | landlord | /properties, /leases | 入住點交與退租怎麼走？ |
| tenant-pay-rent.md | tenant | /payment | 我要怎麼繳租、上傳憑證？ |
| tenant-repair.md | tenant | /maintenance, /equipment-events | 我要怎麼報修、看進度？ |
| tenant-meter.md | tenant | /meter | 電表怎麼抄、怎麼上傳？ |
| tenant-movein.md | tenant | /check-in, /move-in-photos | 入住確認與起租拍照怎麼做？ |
| tenant-moveout.md | tenant | /move-out-agreement, /move-out-progress | 退租結算怎麼確認？ |
| tenant-messages.md | tenant | /messages | 怎麼留言、回覆續約？ |
| manager-cc-login.md | manager | /login | 指揮中心怎麼用 LINE 登入？ |
| manager-rent.md | manager | /rent | 收租審核與催收在哪裡做？ |
| manager-repair.md | manager | /repair | 報修案件怎麼看、怎麼派？ |
| manager-listing.md | manager | /listing | 招租刊登與帶看在哪裡？ |
| manager-moveout.md | manager | /moveout-center | 退租中心怎麼處理？ |
| manager-team.md | manager | /team | 怎麼加團隊成員？ |
| faq-liff-blank.md | landlord, tenant, manager | / | 打不開 LIFF／白畫面怎麼辦？ |
| faq-phone-change.md | landlord, tenant, manager | / | 換手機後租約不見了？ |
| faq-rent-rejected.md | landlord, tenant | /payment, /rent-overview | 繳租審核被退回怎麼辦？ |

## 嵌入設定（工程師）

origin 白名單建議：

- `https://cc.homigo.workers.dev`
- `https://liff.line.me`
- `http://localhost:5173`

更換 widget key 後，產品前端的 widget `data-key` 也要改。

## 試問

房東（landlord，頁路徑 `/properties`）

1. 有文件：「我要怎麼新增物件？」應引用新增物件說明。
2. 無文件：「今天股價多少？」應說實話並出現請客服聯繫我。
3. 換角色：同一題用 tenant 試問，不應教房客進物件新增頁。

房客（tenant，頁路徑 `/payment`）

1. 有文件：「我要怎麼繳租？」應引用繳租與上傳憑證。
2. 無文件：「我這個月租金繳了沒」應說實話（小幫手不查真實帳務）並留資。
3. 換角色：同一題用 manager 試問，不應只講房客 App 底部繳租。

代管（manager，頁路徑 `/repair`）

1. 有文件：「報修案件怎麼派？」應引用指揮中心報修說明。
2. 無文件：「幫我改合約金額」應說實話並留資。
3. 換角色：同一題用 landlord 試問，不應教房東進指揮中心左側選單。
