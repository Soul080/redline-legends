#!/bin/sh
# macOS double-click launcher. Same server as start.sh.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 serve.py --open --port "${PORT:-8080}"
fi
if command -v python >/dev/null 2>&1; then
  exec python serve.py --open --port "${PORT:-8080}"
fi
echo "Python 3 is required. Install it, then run this launcher again."
exit 1
