#!/bin/sh
# Serves Redline Legends 3D, then opens the browser.
# Opening index.html as a file also works when js/bundle.js is present.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py --open --port "${PORT:-8080}"
fi
if command -v python >/dev/null 2>&1; then
  exec python serve.py --open --port "${PORT:-8080}"
fi
echo "Python 3 is required. Install it, then run this launcher again."
echo "Or open index.html in Chrome or Firefox — the game is bundled for file://."
exit 1
