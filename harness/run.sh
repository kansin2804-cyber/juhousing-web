#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PY="/home/ju/n8n-media/.venv/bin/python3"
[[ -x "$PY" ]] || PY=python3

MODE="${1:-offline}"
FAIL=0

echo "== ju_website harness: pytest regression =="
if "$PY" -m pytest harness/regression/ -ra; then
  :
else
  FAIL=1
fi

if [[ "$MODE" == "full" ]] || [[ "$MODE" == "smoke" ]]; then
  echo
  echo "== ju_website harness: n8n live smoke =="
  if bash harness/smoke/consult_n8n.sh; then
    :
  else
    FAIL=1
  fi
  echo
  echo "== ju_website harness: estimate render smoke =="
  if bash harness/smoke/estimate_render.sh; then
    :
  else
    FAIL=1
  fi
  echo
  echo "== ju_website harness: cross-stack smoke =="
  if bash /home/ju/workflows/harness/smoke/cross_stack.sh; then
    :
  else
    FAIL=1
  fi
fi

if [[ $FAIL -eq 0 ]]; then
  echo "== ju_website harness: OK =="
  exit 0
fi
echo "== ju_website harness: FAILED =="
exit 1
