# 教學 Short｜剪輯數字

## 側錄 `record.mjs`

- Playwright viewport **390×693**，`deviceScaleFactor` 3，Chrome 視窗約 420×800。
- 關掉 Playwright `recordVideo`。用 ffmpeg `avfoundation` 錄螢幕，再依視窗裁切。
- crop 寬用 viewport **390**，不要整窗 420（右邊會多白邊）。
- `topChrome` 約 86。錄影時可藏 Dock。
- 輸出：`videos/shorts/tutorials/{slug}/raw/screen.mp4` → crop → `raw/full.mp4` + `raw/timestamps.json`。

第一次沒畫面：系統設定 → 隱私權 → 螢幕錄製，勾 Cursor／終端機。

## 剪輯 `edit.py`

1. 掃描 `raw/full.mp4` 右側近白直欄並裁掉（add-property 曾 1000→780）。
2. 等比放大到寬 1080，高度隨內容；上方 pad **140px** 深藍 `#023047` 放標題白字。
3. 字幕 pill：`(2,48,71,220)`，高約 110，垂直中心在 **0.75 × 成片高**。
4. 浮水印：`public/brands/homigo-logo.png` thumbnail 520，alpha 0.30，置中於 App 區。
5. 編碼：h264 crf 18、30fps、約 2Mbps、無音訊。
6. 先跑 `cover.py --width --height`，封面 loop 1 秒 concat 到本體前面。

標題與字幕用思源黑體：

- `podcast-assets/fonts/SourceHanSansTW-Bold.otf`
- `podcast-assets/fonts/SourceHanSansTW-Regular.otf`

## 封面 `cover.py`

- 畫布跟成片同寬高。
- 底 `#F0F9FC`。logo 原色、寬約 720，置中。
- 標題約 140px 深藍；hint 約 52px 青色。整組垂直置中。
- 底部黃線 +「Homigo 教學」。

## 資料夾

```
videos/shorts/tutorials/{slug}/
  script.json
  raw/full.mp4
  raw/timestamps.json
  edit/
  output/{slug}.mp4
  output/{slug}-cover.png
  status.json
```
