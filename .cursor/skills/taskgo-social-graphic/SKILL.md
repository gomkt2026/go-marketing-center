---
name: taskgo-social-graphic
description: >-
  Generates TaskGo / 匠管 Facebook and Instagram graphics in the original navy-cyan
  construction-tech style with Taiwanese site culture. Use when creating TaskGo
  or 匠管 圖文, FB/IG 配圖, 社群設計圖, 自動發文產圖, or any social image for 工班 / 案場 / 派工.
---

# TaskGo 社群圖文（匠管既有風格）

之後凡是 TaskGo／匠管 FB、IG 圖文，都照這套產出，讓讀者一眼認出是匠管。短影音阿豪卡仍走橘 `#ED9121`，不要混用。

細節與色票見 [references/visual-spec.md](references/visual-spec.md)。原帳號拼圖：[original-fb-ig-1.jpg](references/original-fb-ig-1.jpg)、[original-fb-ig-2.jpg](references/original-fb-ig-2.jpg)。

## 產圖前

1. 讀 visual-spec，並對照兩張原圖拼貼。
2. 主標從文案第一句抽出 **4–10 字繁中**，與 hook 同義。另寫 **8–16 字優勢小字**（例如「讓職人經驗變成可複製的標準」）。主標與優勢由系統用思源黑體後製，prompt 不要叫模型畫中文。
3. 可給一個全大寫英文使命詞（STANDARD / TRACE / CREW / CONTROL），後製小字，不要叫模型畫。
4. 加一個台灣錨：開工、端午工地粽、中元普渡工安、颱風天收工、大台北案場、LINE 群。不要政治、宗教對立、工安傷亡。
5. IG 用 4:5；FB 用橫式 1.91:1 或接近 16:9。

## 生圖 prompt 必含

- 海軍藍 `#0B2D5C`、青藍 `#2BA3D6`、白；橘／黃只點主標色塊。禁止洋紅、珊瑚、粉紅當主色
- 日本當代插畫 × 時尚編輯海報 × 北歐平面：平塗色面、2–3 階陰影，不是寫實工地風景照
- 背景是圖形不是風景：斜切色塊約 50–60%、淡青蜂巢／網點、墨水噴濺、紙紋
- 人物是構圖元素：胸上或全身，側臉、回望或邁步；台灣工班（東亞臉、安全帽、反光背心、平板或 LINE）
- 邊角可放藍色圓頭機器人（大圓眼、短天線），不當主角
- 直式上方 25%（橫式左側 38%）留空色塊，不要任何文字；系統會疊正確繁中主標與優勢小字
- 系統截圖必須做成痛點海報（工班情境 + 畫面當解法卡），不要整頁後台置中
- 實拍要轉成這套平面海報，不要原圖直發
- 不要畫 logo（系統會後製合成）
- 禁止：深灰語錄卡、歐美棚拍、簡體字、亂碼小字、3D CGI 肖像

## 自動發文

程式規格在 `functions/_shared/prompts.ts` 的 `BRAND_DESIGN_IMAGE_STYLE.taskgo`。改風格時兩處一起改。
