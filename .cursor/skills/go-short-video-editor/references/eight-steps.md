# 八步驟在本 Skill 的分工

產品（Go Marketing）負責 1–4，本 Skill 負責 5–8。

| 步驟 | 誰做 | 產出 |
|---|---|---|
| 1 素材檢查 | 產品 | 來源可解碼、Podcast 必須 `approved` |
| 2 時間碼 | 產品 | Scribe v2 或依腳本估時 |
| 3 內容整理 | 產品 | 2–4 個 30 秒候選 |
| 4 剪輯決策 | 人類在 UI 核准策略卡 | `strategy` |
| 5 逐段粗剪 | 本 Skill / `render-short-video.py` | 依 `edl.json` 組音訊與畫面 |
| 6 標題／字幕 | 本 Skill | Pillow 標題卡 + 思源黑體燒字幕 |
| 7 720p 預覽 | 本 Skill | `preview.mp4`，等人核准 |
| 8 定稿 | 本 Skill（預覽核准後） | `final.mp4` + 解碼檢查 |

自修正最多 3 輪（字幕溢位、長度偏差 > 3 秒、無法解碼）。超過就停並回報。
