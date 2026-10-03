#!/usr/bin/env bash
set -euo pipefail

check() {
  local name="$1"
  local url="$2"
  printf '%-24s ' "$name"
  curl -fsS "$url" >/dev/null
  echo "OK"
}

check "frontend health" "http://localhost:3000/health"
check "customer health" "http://localhost:8001/health"
check "catalog health" "http://localhost:8002/health"
check "order health" "http://localhost:8003/health"
check "frontend -> customer" "http://localhost:3000/api/customer/health"
check "frontend -> catalog" "http://localhost:3000/api/catalog/health"
check "frontend -> order" "http://localhost:3000/api/order/health"
check "customer dependencies" "http://localhost:3000/api/customer/dependencies"
check "catalog dependencies" "http://localhost:3000/api/catalog/dependencies"
check "order dependencies" "http://localhost:3000/api/order/dependencies"

echo "Smoke test passed."
