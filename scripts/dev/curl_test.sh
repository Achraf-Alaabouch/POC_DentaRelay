#!/usr/bin/env bash
# Smoke-test a hackathon API key against the ThakaaMed v2.3 endpoint via curl.
#
# Requires: curl, jq.
# Usage:
#   API_KEY=XXXX FACILITY_CODE=HACKxx bash curl_test.sh
#   API_KEY=XXXX FACILITY_CODE=HACKxx IMAGE=/path/to/radio.jpg bash curl_test.sh

set -euo pipefail

: "${API_KEY:?set API_KEY=<your hackathon api key>}"
: "${FACILITY_CODE:?set FACILITY_CODE=<your facility code, e.g. HACK01>}"
IMAGE="${IMAGE:-$(dirname "$0")/../../data/samples/panoramic/panoramic_001.jpg}"
ENDPOINT="https://aiv4.thakaamed.com/api/v2.3/en/analyze/radiography/"

echo "→ POST ${ENDPOINT}  (image: ${IMAGE})"
SLUG=$(curl -sS -X POST "${ENDPOINT}" \
  -F "api_key=${API_KEY}" \
  -F "facility_code=${FACILITY_CODE}" \
  -F "image=@${IMAGE}" | tee /dev/stderr | jq -r '.id // empty')

if [[ -z "${SLUG}" ]]; then
  echo "FAIL — no slug returned (check api_key / facility_code above)" >&2
  exit 2
fi

echo "  queued: slug=${SLUG}"
echo "  sleeping 5s before first poll…"
sleep 5

for i in 1 2 3 4 5 6 7 8 9 10; do
  RESP=$(curl -sS "${ENDPOINT}?id=${SLUG}")
  if echo "${RESP}" | jq -e '.is_done == true' >/dev/null 2>&1; then
    echo "OK — analysis returned"
    echo "${RESP}" | jq '{
      id, is_done, error_status, message,
      teeth_detected: (.results.tooth_results // {} | length),
      pathologies: ([.results.tooth_results // {} | to_entries[] | .value.illnesses // [] | length] | add // 0),
      draw_image,
      embeded_link
    }'
    exit 0
  fi
  echo "  poll ${i}/10 — still processing"
  sleep 3
done

echo "TIMEOUT — analysis ${SLUG} still queued after ~35s, contact organisers" >&2
exit 4
