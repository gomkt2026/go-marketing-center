# 短影音渲染 Container

Pages Functions 不跑 FFmpeg。這個映像讀 `edit/pack.json`，輸出 `preview.mp4` 或 `final.mp4`。

## 本機

字體放到 `podcast-assets/fonts/SourceHanSansTW-Regular.otf` 與 `SourceHanSansTW-Bold.otf`。

```bash
python3 scripts/render-short-video.py --pack ./edit/<jobId> --mode preview
python3 scripts/render-short-video.py --pack ./edit/<jobId> --mode final
```

或：

```bash
docker build -t go-short-renderer -f workers/video-renderer/Dockerfile .
docker run --rm -v "$PWD/edit:/work/edit" go-short-renderer --pack /work/edit/<jobId> --mode preview
```

然後用產品頁「上傳 720p 預覽 / 正式檔」，或：

```bash
curl -b cookies.txt -F kind=preview -F file=@edit/<jobId>/preview.mp4 \
  https://<host>/api/video-jobs/<jobId>/render-result
```

## Cloudflare Containers / Fly

把此 Dockerfile 部署成獨立服務，由 Scheduler 在 `video_jobs.status = rendering_preview | rendering_final` 時拉 edit pack、渲染、回傳 mp4。不要把 FFmpeg 塞進 Pages Function。
