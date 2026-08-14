---
name: go-short-video-editor
description: >-
  Renders Go Marketing 9:16 30-second shorts from an edit pack (podcast clips
  or uploaded footage). Use when the user asks to cut a podcast into a short,
  render a video_job edit pack, burn 思源黑體 subtitles, or produce preview.mp4 /
  final.mp4 for Homigo, TaskGo, or Washgo.
---

# Go Marketing 短影音渲染

把產品產出的 `edit/` 契約包剪成 30 秒直式短影音。你是**渲染手**，不是編輯腦：策略、Hook、EDL 已由 Go Marketing 決定。

## 何時使用

- 使用者說「用 go-short-video-editor」「渲染短影音」「剪 Podcast 切杯」
- 本機有 `edit/project.md` + `edit/edl.json`，或 R2 下載的 edit pack
- 要把 preview / final 回傳到 `video_jobs`

## 硬規則

- 原始音檔 / 影片只讀，不覆寫、不移動、不刪除
- 所有產物寫在素材旁的 `edit/`，或 job 指定的輸出目錄
- 預覽核准前只輸出 `preview.mp4`（720×1280），不准自稱定稿
- `final.mp4`（1080×1920）只在使用者明確核准預覽後渲染
- 不把 `ELEVENLABS_API_KEY` 貼進聊天、命令列、git、log
- 不靜默改 EDL 剪接點；要改先說明並等人同意
- 第一期不做 B-roll、配樂、HyperFrames / GSAP

## 環境檢查

開始前確認：

```bash
ffmpeg -version
ffprobe -version
python3 -c "from PIL import Image, ImageDraw, ImageFont; print('pillow-ok')"
```

字體（思源黑體 TW Regular + Bold）必須存在，預設路徑：

- `podcast-assets/fonts/SourceHanSansTW-Regular.otf`
- `podcast-assets/fonts/SourceHanSansTW-Bold.otf`

缺少字體時停止，請使用者從 Adobe [source-han-sans release](https://github.com/adobe-fonts/source-han-sans/tree/release/SubsetOTF/TW) 下載，**不要**自行換其他字體。

## 執行順序

1. 讀 [edit-contract.md](references/edit-contract.md)，確認 pack 完整
2. 讀 [brand-styles.md](references/brand-styles.md)，套對品牌色與說話人
3. 依 [eight-steps.md](references/eight-steps.md) 只做步驟 5–8（粗剪 → 字幕 → 預覽 → 定稿）
4. 跑專案腳本（優先，不要手寫一次性 FFmpeg）：

```bash
python3 scripts/render-short-video.py --pack /path/to/edit --mode preview
```

5. 預覽給使用者看。核准後：

```bash
python3 scripts/render-short-video.py --pack /path/to/edit --mode final
```

6. 若 job 來自產品，用 `POST /api/video-jobs/:id/render-result` 上傳對應檔案（`kind=preview` 或 `kind=final`）

## 從產品拉 edit pack

已登入的本機開發可用：

```bash
curl -b cookies.txt https://<host>/api/video-jobs/<id>/edit-pack -o edit-pack.json
```

把 `edit-pack.json` 與來源音檔放到同一 `edit/` 後再渲染。

## 完成定義

- `preview` 模式：存在可完整解碼的 `edit/preview.mp4`，長度約 28–32 秒
- `final` 模式：使用者已核准預覽，且 `edit/final.mp4` 為 1080×1920、可完整解碼
- 指令跑過 ≠ 完成；沒有檔案與 QA 就不說「已出片」
