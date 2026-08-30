---
name: go-ops-sop-video
description: >-
  Turns Homigo / TaskGo / Washgo screen recordings into operational SOP
  training videos with step-accurate Traditional Chinese narration, 思源黑體
  burned-in subtitles, and ElevenLabs voiceover. Use when the user asks for
  工班/後勤教學片, 場勘/報修/報價操作影片, 字幕配音 on a product UI recording, or to
  standardize a system操作 Skill.
---

# Go Marketing 操作 SOP 教學片

把產品畫面錄影做成**工班與後勤能照著做**的教學片。你同時是編輯腦與渲染手：先拆出精準步驟，再配音、燒字幕、出預覽。

這不是 30 秒行銷短影音。短影音用 `go-short-video-editor`。本 Skill 保留原始操作畫面，不裁成 Hook，不配 B-roll。

## 何時使用

- 使用者丟 TaskGo / Homigo / Washgo 系統操作錄影，要求字幕 + 配音
- 要把場勘、報修、報價、派工做成標準教學
- 使用者說「讓工班看得懂」「後勤要會操作」「做成平台標準 Skill」

## 硬規則

- 原始錄影只讀：不覆寫、不移動、不刪除
- 產物寫在 `sop-assets/<sop-id>/`，不要寫回桌面或 Downloads
- 預覽核准前只輸出 `preview.mp4`，不准自稱定稿
- `final.mp4` 只在使用者明確核准預覽後渲染
- 不把 `ELEVENLABS_API_KEY` 貼進聊天、命令列、git、log
- 台詞必須唸出**畫面上的按鈕／欄位原文**，禁止「點那個」「按一下就好」
- 一句只教一個動作；不要同時講兩個按鈕
- 不靜默改時間軸；要改先說明並等人同意
- 不把教學片硬轉 9:16。桌面錄影保持橫式，手機錄影保持直式

## 與短影音的差別

| | 短影音 | 本 Skill |
|---|---|---|
| 目的 | 行銷、停留 | 工班／後勤會操作 |
| 長度 | 28–32 秒 | 跟操作走，通常 45–150 秒 |
| 畫面 | 封面＋頭像卡 | 真實系統畫面，不裁關鍵按鈕 |
| 台詞 | Hook／金句 | 按鈕原文＋下一步 |
| 畫幅 | 永遠 9:16 | 跟來源：橫式桌面或直式手機 |

## 環境檢查

```bash
ffmpeg -version
ffprobe -version
python3 -c "from PIL import Image, ImageDraw, ImageFont; print('pillow-ok')"
```

字體必須存在：

- `podcast-assets/fonts/SourceHanSansTW-Regular.otf`
- `podcast-assets/fonts/SourceHanSansTW-Bold.otf`

配音需要本機 `.env` 的 `ELEVENLABS_API_KEY`。沒有金鑰就先出字幕預覽，不要假裝有配音。

## 執行順序

1. 讀 [sop-catalog.md](references/sop-catalog.md)，對上是哪一條標準流程、誰在操作
2. 讀 [narration-style.md](references/narration-style.md) 與 [subtitle-spec.md](references/subtitle-spec.md)
3. 抽關鍵畫面（約每 2–5 秒），寫出逐步 `cues`：時間、步驟、按鈕原文、台詞
4. 依 [edit-contract.md](references/edit-contract.md) 寫 `sop-pack.json`
5. 合成配音（有金鑰才做）。改語速或台詞後加 `--force`：

```bash
python3 scripts/synthesize-sop-voice.py --pack sop-assets/<sop-id> --force
```

6. 渲染預覽：

```bash
python3 scripts/render-sop-video.py --pack sop-assets/<sop-id> --mode preview
```

7. 把預覽給使用者看。核准後才：

```bash
python3 scripts/render-sop-video.py --pack sop-assets/<sop-id> --mode final
```

同一條產品流程有多支來源（例如後台建案 + 手機場勘 + 帶入報價）時，拆成多個 `sop-id`，用同一套步驟用語，不要混成一支看不清角色的長片。

## 完成定義

- 每個 sop-id 有可讀的 `sop-pack.json`，每個 cue 都寫了畫面按鈕原文
- `preview`：存在可完整解碼的 `preview.mp4`，字幕與配音對得上點擊
- `final`：使用者已核准預覽，且 `final.mp4` 可完整解碼
- 指令跑過 ≠ 完成；沒有檔案與逐步核對就不說「已出片」
