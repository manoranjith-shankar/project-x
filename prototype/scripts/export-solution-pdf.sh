#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HTML="$ROOT/public/solution-slide.html"
OUT="$ROOT/John-solution.pdf"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [[ ! -x "$CHROME" ]]; then
  echo "Google Chrome not found at $CHROME" >&2
  exit 1
fi
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="$OUT" \
  "file://$HTML"
echo "Wrote $OUT"
