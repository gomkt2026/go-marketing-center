# Go Marketing 短影音渲染 Container
# 本機: docker build -t go-short-renderer -f workers/video-renderer/Dockerfile .
#       docker run --rm -v "$PWD/edit:/work/edit" go-short-renderer --pack /work/edit/<jobId> --mode preview
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
  && pip install --no-cache-dir pillow \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work
COPY scripts/render-short-video.py /work/scripts/render-short-video.py
# 思源黑體請用 volume 掛進 /work/podcast-assets/fonts(見 README)

ENTRYPOINT ["python3", "/work/scripts/render-short-video.py"]
CMD ["--help"]
