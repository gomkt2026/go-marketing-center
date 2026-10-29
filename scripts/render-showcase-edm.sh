#!/bin/sh
# 把三份產品 EDM 印成單頁 A4 PDF，放到 public/showcase/edm/
set -eu
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/scripts/showcase-edm"
OUT="$ROOT/public/showcase/edm"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"
for name in taskgo homigo washgo; do
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer \
    --print-to-pdf="$OUT/$name.pdf" \
    "file://$SRC/$name.html"
  pages=$(python3 -c "import pathlib,re,sys; d=pathlib.Path(sys.argv[1]).read_bytes(); print(len(re.findall(br'/Type\s*/Page[^s]', d)))" "$OUT/$name.pdf")
  echo "$name.pdf  $pages page(s)  $(wc -c < "$OUT/$name.pdf") bytes"
done
