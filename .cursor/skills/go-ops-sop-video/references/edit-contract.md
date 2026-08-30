# sop-assets/ 契約

每個 SOP 一個資料夾。缺必填欄位就停，不要猜來源路徑。

```text
sop-assets/<sop-id>/
├── sop-pack.json      # 必填
├── master.srt         # 渲染時可重產
├── voice/             # synthesize-sop-voice.py 寫入，勿提交
│   ├── <cue-id>.mp3
│   └── mix.wav
├── qa/
├── preview.mp4
└── final.mp4
```

來源錄影留在原位，`sourcePath` 寫絕對路徑。不要把 `.mov`／`.mp4` 複製進 git。

## sop-pack.json 必填

```json
{
  "version": 1,
  "sopId": "taskgo-survey-to-quote",
  "catalogKey": "SOP-03",
  "brandSlug": "taskgo",
  "audience": "backoffice",
  "title": "場勘後帶入報價草稿",
  "goal": "場勘完成後，把 SOP 轉成客戶報價草稿並準備傳送",
  "sourcePath": "/absolute/path/to/source.mov",
  "sourceKind": "desktop",
  "narrator": "阿豪",
  "voiceId": "auoHciLZJwKTwYUoRTYz",
  "nextSopId": "taskgo-mobile-leak-survey",
  "cues": []
}
```

`audience`：`backoffice` 或 `crew`。  
`sourceKind`：`desktop`（橫式）或 `mobile`（直式）。  
`catalogKey`：對 [sop-catalog.md](sop-catalog.md) 的 SOP-01／02／03。

## cue 必填

```json
{
  "id": "c03",
  "startMs": 8000,
  "endMs": 13000,
  "step": 2,
  "stepTotal": 6,
  "action": "帶入報價草稿",
  "target": "從場勘 SOP 帶入報價草稿",
  "narration": "點綠色「從場勘 SOP 帶入報價草稿」。",
  "subtitle": "點「從場勘 SOP 帶入報價草稿」"
}
```

- `target` 必須是畫面看得到的原文
- `startMs`／`endMs` 對齊點擊或欄位焦點，不要只均分片長
- 相鄰 cue 可相接，不要重疊超過 200ms
- 開場、收尾也是 cue，step 可為 0（開場）或與最後一步相同（收尾）

## 預覽與定稿

| 模式 | 桌面 | 手機 |
|---|---|---|
| preview | 長邊 1280 | 寬 720 |
| final | 長邊 1920 | 寬 1080 |

音訊：原片壓到很小（保留滑鼠／鍵盤聲），配音當主聲。  
BGM：Podcast 片頭 `podcast-assets/theme-intro.mp3` 循環、音量 0.09、頭尾淡入淡出。原片接近靜音就只留配音 + BGM。

## 交付

對外只呈現 `final.mp4`，且必須：preview 已核准 → final 已渲染 → 可完整解碼。  
三部曲要一起交時，分別交三支，並在收尾字幕寫下一支的 sop-id 標題。
