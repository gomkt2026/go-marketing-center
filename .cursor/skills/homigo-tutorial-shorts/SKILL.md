---
name: homigo-tutorial-shorts
description: >-
  Homigo 教學 Short 的側錄、剪輯、封面與片頭。Use when the user mentions
  教學 Short、tutorial shorts、製片、剪輯教學片、新增物件成片、
  cover.py、edit.py、record.mjs。
---

# Homigo 教學 Short

本機製片。不上 BGM。不上 YouTube（除非使用者指定）。不要套 9:16。

這不是行銷中心「短影音」的 30 秒直式，也不是 `go-ops-sop-video` 的工班配音片。畫面是 Homigo App 側錄，頂欄與底導覽都要留著。

行銷中心頁面：`/{homigo}/tutorials`（側欄「其他 → 加值內容 → 教學 Short」）。清單以那一頁與 `src/data/homigo-tutorial-catalog.json` 為準。

## 檔案

| 用途 | 路徑 |
|---|---|
| Skill | `.cursor/skills/homigo-tutorial-shorts/SKILL.md` |
| ffmpeg／版面數字 | `.cursor/skills/homigo-tutorial-shorts/reference.md` |
| 清單 | `src/data/homigo-tutorial-catalog.json` |
| 一支一夾 | `videos/shorts/tutorials/{slug}/` |
| Logo | `public/brands/homigo-logo.png` |

`record.mjs`、`edit.py`、`cover.py` 還沒進這個 repo。腳本補上之前，不要用一次性 ffmpeg 自己湊成片。

## 成片長相（已確認，勿改）

- 先切錄製右側白邊；頂欄、底導覽都要在，不裁 App。
- 上深藍標題在畫面外（`script.title`）。
- 操作字幕 pill 約在畫面高度 **3/4**，字級 60。
- 中央 logo 原色、alpha **0.30**。
- 封面：淺底 `#F0F9FC`、原色 logo 放大置中、標題加大。先出封面，片頭 **1 秒** 再接本體。
- 成片寬 1080，高度隨完整畫面走（新增物件約 1080×2102）。

## 指令

有 raw 才剪；沒有先錄。一次只做使用者確認過的 slug，不平行狂錄。`add-property` 已完成，預設跳過。

腳本進 repo 之後：

```bash
cd videos/shorts/tutorials
node record.mjs --slug {slug}    # 沒有 raw/full.mp4 時
python3 edit.py --slug {slug}    # 含封面與 1 秒片頭
```

每支：腳本（已有則沿用）→ 錄 → 剪。一支做完再下一支。不推 git、不上架。

## 不要做

- 不要再 pad 成 9:16 或左右各加 40px 深藍。
- 不要重上 logo 顏色當浮水印。
- 不要把大 mp4 push 上 GitHub（除非使用者要）。
- 不要清單未確認就錄完全部。
