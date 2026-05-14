#!/usr/bin/env python3
"""DentaRelay local demo server.

Serves the static app, bundled sample radiographs, and a small proxy for the
ThakaaMed API so hackathon credentials never need to live in browser code.
"""

from __future__ import annotations

import json
import mimetypes
import os
import pathlib
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import requests


ROOT = pathlib.Path(__file__).resolve().parents[1]
APP_DIR = pathlib.Path(__file__).resolve().parent
ENDPOINT_TEMPLATE = "https://aiv4.thakaamed.com/api/v2.3/{lang}/analyze/radiography/"
POLL_INTERVAL_SEC = 3
POLL_MAX_ATTEMPTS = 20


def env(name: str) -> str:
    return os.environ.get(name, "").strip()


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def guess_type(path: pathlib.Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def parse_multipart_file(body: bytes, content_type: str) -> tuple[str, bytes]:
    marker = "boundary="
    if marker not in content_type:
        raise ValueError("Expected multipart/form-data upload.")
    boundary = ("--" + content_type.split(marker, 1)[1].split(";", 1)[0].strip('"')).encode()
    for part in body.split(boundary):
        if b"Content-Disposition" not in part or b'name="image"' not in part:
            continue
        header, _, file_body = part.partition(b"\r\n\r\n")
        if not file_body:
            continue
        file_body = file_body.rsplit(b"\r\n", 1)[0]
        filename = "radiograph.jpg"
        header_text = header.decode("utf-8", errors="ignore")
        if "filename=" in header_text:
            filename = header_text.split("filename=", 1)[1].split(";", 1)[0].strip().strip('"') or filename
        return filename, file_body
    raise ValueError("No image file found in upload.")


class Handler(BaseHTTPRequestHandler):
    server_version = "DentaRelayDemo/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print("[%s] %s" % (self.log_date_time_string(), fmt % args))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/config":
            return json_response(
                self,
                200,
                {
                    "live_ready": bool(env("THAKAAMED_API_KEY") and env("THAKAAMED_FACILITY_CODE")),
                    "facility_code": env("THAKAAMED_FACILITY_CODE") or None,
                },
            )
        return self.serve_file(parsed.path)

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        path = self.resolve_path(parsed.path)
        if not path or not path.is_file():
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", guess_type(path))
        self.send_header("Content-Length", str(path.stat().st_size))
        self.end_headers()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/analyze":
            return json_response(self, 404, {"error": "Unknown endpoint."})

        api_key = env("THAKAAMED_API_KEY")
        facility = env("THAKAAMED_FACILITY_CODE")
        if not api_key or not facility:
            return json_response(self, 400, {"error": "Server is missing THAKAAMED_API_KEY or THAKAAMED_FACILITY_CODE."})

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return json_response(self, 400, {"error": "No upload body received."})
        if length > 50 * 1024 * 1024:
            return json_response(self, 413, {"error": "Image exceeds ThakaaMed's 50 MB limit."})

        try:
            filename, image_bytes = parse_multipart_file(self.rfile.read(length), self.headers.get("Content-Type", ""))
        except ValueError as exc:
            return json_response(self, 400, {"error": str(exc)})

        query = parse_qs(parsed.query)
        lang = (query.get("lang") or ["fr"])[0]
        if lang not in {"fr", "ar", "en"}:
            lang = "fr"
        endpoint = ENDPOINT_TEMPLATE.format(lang=lang)

        try:
            submit = requests.post(
                endpoint,
                data={"api_key": api_key, "facility_code": facility},
                files={"image": (filename, image_bytes)},
                timeout=60,
            )
            submit.raise_for_status()
            submission = submit.json()
            slug = submission.get("id")
            if not slug:
                return json_response(self, 502, {"error": "ThakaaMed did not return an analysis id.", "submission": submission})

            started = time.monotonic()
            for _ in range(POLL_MAX_ATTEMPTS):
                time.sleep(POLL_INTERVAL_SEC)
                poll = requests.get(endpoint, params={"id": slug}, timeout=30)
                poll.raise_for_status()
                data = poll.json()
                if data.get("is_done") is True:
                    data["_dentarelay"] = {"elapsed_seconds": round(time.monotonic() - started, 1), "language": lang}
                    return json_response(self, 200, data)
            return json_response(self, 504, {"error": "Analysis timed out after 60 seconds.", "id": slug})
        except requests.RequestException as exc:
            return json_response(self, 502, {"error": f"ThakaaMed request failed: {exc}"})
        except json.JSONDecodeError:
            return json_response(self, 502, {"error": "ThakaaMed returned a non-JSON response."})

    def resolve_path(self, request_path: str) -> pathlib.Path | None:
        routes = {
            "/": APP_DIR / "index.html",
            "/app.js": APP_DIR / "app.js",
            "/styles.css": APP_DIR / "styles.css",
            "/sample-analysis": ROOT / "examples" / "sample_v23_analysis.json",
            "/sample-xray": ROOT / "data" / "samples" / "panoramic" / "panoramic_001.jpg",
        }
        path = routes.get(request_path)
        if path is None and request_path.startswith("/data/"):
            path = (ROOT / request_path.lstrip("/")).resolve()
            if ROOT not in path.parents:
                path = None
        if path is None and request_path.startswith("/examples/"):
            path = (ROOT / request_path.lstrip("/")).resolve()
            if ROOT not in path.parents:
                path = None
        return path

    def serve_file(self, request_path: str) -> None:
        path = self.resolve_path(request_path)
        if not path or not path.is_file():
            self.send_error(404)
            return
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", guess_type(path))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    port = int(os.environ.get("PORT", "7860"))
    httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"DentaRelay demo running at http://127.0.0.1:{port}")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
