#!/bin/sh
# Local server for features that cannot run from a file:// page
# (online races, community tracks, and in-browser NPC chat).
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8080}"
echo "Redline Legends at http://127.0.0.1:${PORT}/"
python3 -m http.server "$PORT" &
PID=$!
sleep 0.4
URL="http://127.0.0.1:${PORT}/"
if command -v open >/dev/null 2>&1; then
  open "$URL"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
else
  echo "Open $URL"
fi
trap 'kill "$PID" 2>/dev/null' INT TERM
wait "$PID"
