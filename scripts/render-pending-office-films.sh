#!/usr/bin/env bash
# 讀 R2 上還沒畫完的晨會腳本，做成 9:16 mp4 再放回去。
# 不發文。GitHub 排程或本機都可以跑。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
WORK="${TMPDIR:-/tmp}/office-films"
mkdir -p "$WORK"
BUCKET="go-marketing-media"

if ! npx wrangler r2 object get "$BUCKET/videos/office-meetings/queue.json" --file "$WORK/queue.json" --remote; then
  echo "還沒有待錄的晨會"
  exit 0
fi

# 先把編號整份讀完。畫片時 ffmpeg 會讀標準輸入，不能邊讀清單邊畫。
node -e '
const fs = require("fs");
const q = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const id of q.ids || []) {
  if (/^[0-9a-f-]{36}$/i.test(id)) console.log(id);
}
' "$WORK/queue.json" > "$WORK/ids.txt"
ids=()
while IFS= read -r id || [ -n "$id" ]; do
  [ -n "$id" ] && ids+=("$id")
done < "$WORK/ids.txt"

failed=0
for id in "${ids[@]+"${ids[@]}"}"; do
  url="https://go-marketing-center.pages.dev/api/media/videos/office-meetings/${id}/meeting.mp4"
  code="$(curl -s -o /dev/null -w "%{http_code}" -I "$url" || true)"
  if [ "$code" = "200" ]; then
    echo "$id 已經有影片"
    continue
  fi
  echo "錄 $id"
  if ! npx wrangler r2 object get "$BUCKET/videos/office-meetings/${id}/script.json" --file "$WORK/${id}.json" --remote; then
    echo "$id 沒有腳本，跳過"
    failed=1
    continue
  fi
  if ! python3 scripts/render-office-meeting.py --script "$WORK/${id}.json" --out "$WORK/${id}.mp4" </dev/null; then
    echo "$id 沒畫成"
    failed=1
    continue
  fi
  if ! npx wrangler r2 object put "$BUCKET/videos/office-meetings/${id}/meeting.mp4" \
    --file "$WORK/${id}.mp4" --content-type video/mp4 --remote -y; then
    echo "$id 沒放上去"
    failed=1
    continue
  fi
  rm -f "$WORK/${id}.mp4" "$WORK/${id}.json"
done

if [ "$failed" -ne 0 ]; then
  exit 1
fi
