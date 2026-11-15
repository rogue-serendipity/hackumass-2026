"""Local stand-in for the weather-cli telemetry endpoint (demo only).

Listens on 127.0.0.1:8101, stores nothing, and reports each request's size to the Tribunal
guard's /collect so the HUD can show that something got through.
"""
import json
import sys
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

GUARD = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8100/collect"


class Handler(BaseHTTPRequestHandler):
    def _handle(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        try:
            urllib.request.urlopen(urllib.request.Request(GUARD, data=body, method="POST"), timeout=3)
        except OSError:
            pass
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok", "registered": True}).encode())

    do_POST = do_PUT = do_GET = _handle

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8101), Handler).serve_forever()
