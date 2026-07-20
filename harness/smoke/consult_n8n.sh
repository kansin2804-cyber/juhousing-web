#!/usr/bin/env bash
# Live smoke: n8n consult-chat + blog-consult (spam-filter fast path — no AI, no lead write).
set -uo pipefail

BASE="${JU_WEBSITE_N8N_WEBHOOK_BASE:-https://n8n.juhousing.co.kr/webhook}"
BASE="${BASE%/}"
CHAT_URL="${BASE}/consult-chat"
INTAKE_URL="${BASE}/blog-consult"
REQUIRE_LIVE="${JU_WEBSITE_HARNESS_REQUIRE_LIVE:-}"

pass=0
fail=0

pass_case() { echo "[PASS] $1"; pass=$((pass + 1)); }
fail_case() { echo "[FAIL] $1 — $2"; fail=$((fail + 1)); }

check_reachable() {
  if ! curl -sf --max-time 5 -o /dev/null -w "%{http_code}" -X POST "$CHAT_URL" \
    -H "Content-Type: application/json" \
    -d '{"message":"ping","_ju_ts":0,"_hp_url":""}' | grep -q '200'; then
    return 1
  fi
  return 0
}

smoke_consult_chat() {
  local tmp body code
  tmp=$(mktemp)
  code=$(curl -sS -o "$tmp" -w "%{http_code}" --max-time 20 -X POST "$CHAT_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{"message":"harness smoke","messages":[],"_ju_ts":0,"_hp_url":""}' || echo "000")
  body=$(cat "$tmp")
  rm -f "$tmp"
  if [[ "$code" == "200" ]] && python3 -c "
import json,sys
d=json.loads(sys.argv[1])
assert d.get('ok') is True
assert d.get('reply')
" "$body" 2>/dev/null; then
    pass_case "n8n consult-chat (spam-filter path)"
  else
    fail_case "n8n consult-chat" "HTTP $code body=${body:0:120}"
  fi
}

smoke_blog_consult() {
  local tmp body code
  tmp=$(mktemp)
  code=$(curl -sS -o "$tmp" -w "%{http_code}" --max-time 20 -X POST "$INTAKE_URL" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json" \
    -d '{"성함":"harness","연락처":"000","_ju_ts":0,"_hp_url":"","유입경로":"harness_smoke"}' || echo "000")
  body=$(cat "$tmp")
  rm -f "$tmp"
  if [[ "$code" == "200" ]] && python3 -c "
import json,sys
d=json.loads(sys.argv[1])
assert d.get('harness') is True or d.get('spam') is True or d.get('ok') is False
" "$body" 2>/dev/null; then
    pass_case "n8n blog-consult (spam-filter path)"
  else
    fail_case "n8n blog-consult" "HTTP $code body=${body:0:120}"
  fi
}

echo "== ju_website harness smoke: n8n consult webhooks @ $BASE =="

if ! check_reachable; then
  if [[ "$REQUIRE_LIVE" == "1" ]]; then
    echo "n8n webhook unreachable (JU_WEBSITE_HARNESS_REQUIRE_LIVE=1)"
    exit 1
  fi
  echo "SKIP n8n smoke — not reachable at $CHAT_URL"
  exit 0
fi

smoke_consult_chat
smoke_blog_consult

if [[ $fail -eq 0 ]]; then
  echo "== ju_website n8n smoke: OK ($pass passed) =="
  exit 0
fi
echo "== ju_website n8n smoke: FAILED ($fail failed, $pass passed) =="
exit 1
