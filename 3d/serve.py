#!/usr/bin/env python3
"""Local static server for Redline Legends 3D.

Stock `python -m http.server` on Windows often labels .js as text/plain, and
browsers then refuse ES modules. This server always sends a JavaScript MIME
type, allows a simple cross-origin fetch, and only then opens the browser.
The game itself is a classic script (js/bundle.js), so file:// can also boot
when the bundle is present.
"""
from __future__ import annotations

import argparse
import os
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **getattr(SimpleHTTPRequestHandler, "extensions_map", {}),
        "": "application/octet-stream",
        ".html": "text/html",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".txt": "text/plain",
        ".map": "application/json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("RL3_QUIET") == "1":
            return
        super().log_message(fmt, *args)


def listen(port: int):
    last = None
    for p in range(port, port + 20):
        try:
            httpd = ThreadingHTTPServer(("127.0.0.1", p), Handler)
            return httpd, p
        except OSError as err:
            last = err
    raise SystemExit("Could not bind a port starting at %s (%s)" % (port, last))


def main():
    parser = argparse.ArgumentParser(description="Serve Redline Legends 3D")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    parser.add_argument("--open", action="store_true", help="Open the browser after the port is listening")
    args = parser.parse_args()
    httpd, port = listen(args.port)
    url = "http://127.0.0.1:%s/" % port
    print("Redline Legends 3D at %s" % url, flush=True)
    print("Leave this window open while you play. Close it to stop the server.", flush=True)
    if args.open:
        webbrowser.open(url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
