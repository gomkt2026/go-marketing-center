# edit/ 契約

產品與渲染手共用這份結構。缺欄位就停，不要猜。

```text
edit/
├── project.md
├── edl.json
├── master.srt
├── pack.json          # 產品寫入的完整 EditPack
├── clips/             # 可選：已切好的音訊片段
├── qa/
├── preview.mp4        # 720×1280
└── final.mp4          # 1080×1920，預覽核准後才有
```

## pack.json 必填

- `version`: `1`
- `jobId`
- `sourceType`: `podcast_clip` | `upload`
- `title`, `cta`
- `edl[]`: `sourceKey` 或本機 `sourcePath`、`startMs`、`endMs`、`speaker`、`text`、`fadeInMs`、`fadeOutMs`
- `srt`
- `strategy.title` / `strategy.estimatedSeconds`
- `brands` 色票、`hosts` 頭像

## EDL 規則

- 只切在字詞／句邊界，不切進字中間
- 每段保留 30–200ms padding
- 音訊 fade 約 30ms
- 總長目標 28–32 秒（策略寫 30 秒）

## 交付

對外只呈現一支 `final.mp4`，且必須：720p 預覽已核准 → 正式檔已渲染 → 正式檔可完整解碼。
