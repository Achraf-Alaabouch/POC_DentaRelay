#!/usr/bin/env python3
"""Smoke-test a hackathon API key against the ThakaaMed v2.3 endpoint.

Usage:
    python validate_api_key.py --api-key XXXX --facility-code HACKxx
    python validate_api_key.py --api-key XXXX --facility-code HACKxx --image path/to/radio.jpg

Exit codes:
    0  OK             analysis returned successfully
    2  AUTH FAILED    api_key / facility_code rejected
    3  QUOTA EXHAUSTED no jetons left on this key
    4  TIMEOUT        analysis still queued after ~60s
    5  NETWORK        could not reach the API
"""
import argparse
import pathlib
import sys
import time

import requests

ENDPOINT = "https://aiv4.thakaamed.com/api/v2.3/en/analyze/radiography/"
DEFAULT_IMAGE = pathlib.Path(__file__).resolve().parents[2] / "data" / "samples" / "panoramic" / "panoramic_001.jpg"
POLL_INTERVAL_SEC = 3
POLL_MAX_ATTEMPTS = 20


def main() -> int:
    p = argparse.ArgumentParser(description="Validate a ThakaaMed hackathon API key.")
    p.add_argument("--api-key", required=True)
    p.add_argument("--facility-code", required=True)
    p.add_argument("--image", default=str(DEFAULT_IMAGE), help=f"default: {DEFAULT_IMAGE}")
    args = p.parse_args()

    image_path = pathlib.Path(args.image)
    if not image_path.is_file():
        print(f"FAIL — image not found: {image_path}", file=sys.stderr)
        return 5

    started = time.monotonic()
    print(f"→ POST {ENDPOINT}  (image: {image_path.name}, {image_path.stat().st_size // 1024} KB)")

    try:
        with image_path.open("rb") as f:
            r = requests.post(
                ENDPOINT,
                data={"api_key": args.api_key, "facility_code": args.facility_code},
                files={"image": f},
                timeout=60,
            )
    except requests.RequestException as e:
        print(f"NETWORK — could not reach API: {e}", file=sys.stderr)
        return 5

    body = (r.text or "").lower()
    if r.status_code in (400, 401, 403) or "wrong api key" in body or "facility key required" in body:
        print(f"AUTH FAILED — HTTP {r.status_code} — check api_key/facility_code\n  body: {r.text[:200]}", file=sys.stderr)
        return 2
    if "insufficient tokens" in body or "quota" in body:
        print(f"QUOTA EXHAUSTED — HTTP {r.status_code}\n  body: {r.text[:200]}", file=sys.stderr)
        return 3
    if not r.ok:
        print(f"FAIL — HTTP {r.status_code}\n  body: {r.text[:200]}", file=sys.stderr)
        return 5

    slug = r.json().get("id")
    if not slug:
        print(f"FAIL — no slug in submission response: {r.text[:200]}", file=sys.stderr)
        return 5
    print(f"  queued: slug={slug}")

    for attempt in range(1, POLL_MAX_ATTEMPTS + 1):
        time.sleep(POLL_INTERVAL_SEC)
        try:
            poll = requests.get(ENDPOINT, params={"id": slug}, timeout=30)
        except requests.RequestException as e:
            print(f"NETWORK — poll failed: {e}", file=sys.stderr)
            return 5
        data = poll.json() if poll.ok else {}
        if data.get("is_done") is True:
            if data.get("error_status") is True:
                print(f"FAIL — API reported error: {data.get('error_message') or data.get('message')}", file=sys.stderr)
                return 5
            elapsed = int(time.monotonic() - started)
            tooth_results = (data.get("results") or {}).get("tooth_results") or {}
            n_teeth = len(tooth_results)
            n_findings = sum(len(t.get("illnesses") or []) for t in tooth_results.values())
            print(f"OK — analysis returned in {elapsed}s, slug={slug}")
            print(f"     teeth detected: {n_teeth}, pathologies: {n_findings}")
            print(f"     annotated overlay: {data.get('draw_image')}")
            print(f"     embedded viewer: {data.get('embeded_link')}")
            return 0
        print(f"  poll {attempt}/{POLL_MAX_ATTEMPTS} — still processing")

    print(f"TIMEOUT — analysis {slug} still queued after {POLL_MAX_ATTEMPTS * POLL_INTERVAL_SEC}s — contact organisers", file=sys.stderr)
    return 4


if __name__ == "__main__":
    sys.exit(main())
