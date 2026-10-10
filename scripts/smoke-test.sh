#!/usr/bin/env sh
set -eu

BASE_URL="${1:-${BASE_URL:-}}"

if [ -z "$BASE_URL" ]; then
  echo "Usage: ./scripts/smoke-test.sh https://xxxx.ngrok.app"
  echo "or set BASE_URL=https://xxxx.ngrok.app"
  exit 2
fi

check() {
  name="$1"
  url="$2"
  echo "[CHECK] $name"
  curl -fsS "$url" >/dev/null
  echo "[OK] $name"
}

expect_blocked() {
  name="$1"
  url="$2"
  echo "[EXPECT BLOCKED] $name"
  if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
    echo "[FAIL] $name was unexpectedly reachable"
    exit 1
  fi
  echo "[OK] blocked as expected"
}

check "frontend BFF health through ngrok" "$BASE_URL/health"
check "BFF products through ngrok" "$BASE_URL/shop/products"
check "BFF orders through ngrok" "$BASE_URL/shop/orders"
check "BFF system through ngrok" "$BASE_URL/shop/system"

expect_blocked "raw order API through public BFF" "$BASE_URL/api/order/orders"
expect_blocked "raw catalog API through public BFF" "$BASE_URL/api/catalog/products"
expect_blocked "frontend host port bypass" "http://localhost:3000"
expect_blocked "catalog host port" "http://localhost:8002/products"
expect_blocked "order host port" "http://localhost:8003/orders"

echo "Private-mode ngrok smoke test passed."
