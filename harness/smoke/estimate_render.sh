#!/usr/bin/env bash
# Live smoke: render_server /website/estimate-guide (spam-safe harness payload).
set -uo pipefail

BASE="${JU_WEBSITE_RENDER_BASE:-http://127.0.0.1:8000}"
BASE="${BASE%/}"
GUIDE_URL="${BASE}/website/estimate-guide"
REQUIRE_LIVE="${JU_WEBSITE_HARNESS_REQUIRE_LIVE:-}"

pass=0
fail=0

pass_case() { echo "[PASS] $1"; pass=$((pass + 1)); }
fail_case() { echo "[FAIL] $1 — $2"; fail=$((fail + 1)); }

PAYLOAD='{"pyeong":30,"facade":"ceramic_standard","roof":"zinc_standard","window":"domestic_double","floor":"engineered_wood","_ju_ts":0,"_hp_url":""}'

echo "== ju_website harness smoke: estimate render @ $GUIDE_URL =="

code=$(curl -sS -o /tmp/ju_est_smoke.json -w "%{http_code}" --max-time 15 -X POST "$GUIDE_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" 2>/dev/null || echo "000")

if [[ "$code" == "000" ]] || [[ "$code" == "000000" ]]; then
  if [[ "$REQUIRE_LIVE" == "1" ]]; then
    echo "render_server unreachable (JU_WEBSITE_HARNESS_REQUIRE_LIVE=1)"
    exit 1
  fi
  echo "SKIP estimate smoke — render_server not reachable at $GUIDE_URL"
  exit 0
fi

body=$(cat /tmp/ju_est_smoke.json 2>/dev/null || true)
rm -f /tmp/ju_est_smoke.json

if [[ "$code" == "200" ]] && python3 -c "
import json,sys
d=json.loads(sys.argv[1])
assert d.get('total_krw') or d.get('formatted')
" "$body" 2>/dev/null; then
  pass_case "render_server /website/estimate-guide"
else
  fail_case "render_server /website/estimate-guide" "HTTP $code body=${body:0:160}"
fi

if [[ $fail -eq 0 ]]; then
  echo "== ju_website estimate smoke: OK ($pass passed) =="
  exit 0
fi
echo "== ju_website estimate smoke: FAILED ($fail failed, $pass passed) =="
exit 1
