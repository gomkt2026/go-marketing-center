# 匠城出任務：網頁遊戲部署說明

一個班 90 秒的 3D 城市跑單小遊戲，一局裡會玩到 TaskGo 報修派工、Homigo 送鑰匙交屋、Washgo 衣物收送。整個遊戲是純靜態檔案，不需要後端，放到任何網站空間都能跑。

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 遊戲本體（含社群分享預覽設定） |
| `vendor/three.min.js` | 3D 引擎 three.js r128（MIT 授權，已附在同一個資料夾，不依賴外部 CDN） |
| `og-image.jpg` | 分享到 FB / LINE / Threads 時顯示的預覽圖（1200×630） |
| `icon.svg`、`icon-192.png`、`icon-512.png`、`apple-touch-icon.png` | 網頁圖示與「加入主畫面」圖示 |
| `manifest.webmanifest` | 讓手機可以把遊戲加入主畫面，以全螢幕開啟 |

## 放進 GO 行銷中心（go-marketing-center）

1. 把整個 `game` 資料夾複製到專案的 `public/game/`。
2. 目前網址設定為 `https://go-marketing-center.pages.dev/game/`（Cloudflare Pages 的預設網域）。之後如果綁了自己的網域，請改兩個地方：
   - `index.html` 開頭的 `og:url`、`og:image`、`twitter:image`、`canonical`（搜尋 `go-marketing-center.pages.dev/game/` 全部取代）
   - `index.html` 裡的 `CONFIG.siteUrl`（同一個搜尋就會找到）
3. `git push`，Cloudflare Pages 會自動部署。
4. 打開 `https://你的網域/game/` 確認看到遊戲標題畫面。
   - Vite 會把 `public/` 原封不動複製到 `dist/`，靜態檔案優先於 `_redirects` 裡的 `/* /index.html 200`，正常情況下不用改設定。
   - 如果打開卻看到行銷中心的 React 頁面，請確認網址最後有斜線 `/game/`。

## 分享前的檢查

- **預覽圖**：部署後，用 [Facebook 分享偵錯工具](https://developers.facebook.com/tools/debug/) 貼上遊戲網址，按「再次抓取」，確認出現標題和預覽圖。LINE 會快取預覽，改過圖後要等一段時間才會更新。
- **手機實測**：分別從 LINE、FB、IG 的內建瀏覽器打開連結玩一局，確認有聲音、搖桿順暢。

## 遊戲內的分享機制

- **成績圖**：結算畫面按「分享成績」，會產生一張 1080×1350 的成績圖（IG 直式尺寸），包含當局畫面、營收、師傅等級與三品牌成績。手機可長按圖片存到相簿；支援系統分享的手機會直接跳出分享選單。
- **挑戰連結**：分享出去的連結會帶分數，例如 `https://go-marketing-center.pages.dev/game/?s=18420`。朋友打開後，標題畫面會顯示「朋友賺了 NT$18,420，換你來挑戰」，結算時也會告訴他有沒有贏。
- **品牌導流**：結算畫面有三個品牌的連結（TaskGo 免費試用、Homigo 官網、Washgo 官網），網址在 `index.html` 的 `CONFIG.links` 修改。

## 追蹤成效（選用）

在 `index.html` 的 `<head>` 貼上 GA4 或 Meta Pixel 追蹤碼（有註解標示位置），遊戲會自動送出下列事件：

| 事件 | 時機 | 附帶資料 |
|---|---|---|
| `game_start` | 按下開始上工 | 是否從挑戰連結進來 |
| `game_end` | 一局結束 | 分數、等級、三品牌完成數 |
| `share_open` / `share_native` / `share_copy` / `share_download` | 各種分享動作 | 分數 |
| `brand_click` | 點品牌連結 | 品牌名稱 |

沒有貼追蹤碼時，這些事件只會寫進 `window.dataLayer`，不影響遊戲。

## 其他

- 個人最佳紀錄存在玩家自己的瀏覽器裡；玩家在結算畫面填暱稱、手機並勾選同意後，成績才會送到排行榜。
- 排行榜 API 在 `CONFIG.api`（預設 `/api/public/game`），改成空字串就關閉排行榜。賽季、獎品與得獎名單在行銷中心後台「設定 → 遊戲排行榜」（`/settings/game`）管理。
- 品牌色：TaskGo `#ff6b1a`、Homigo `#1fae78`、Washgo `#3a8dde`（依 Washgo 品牌規範）。要調整就在 `index.html` 搜尋色碼取代。
