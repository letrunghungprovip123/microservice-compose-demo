#!/usr/bin/env sh
set -eu

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

check "frontend BFF health" http://localhost:3000/health
check "BFF products" http://localhost:3000/shop/products
check "BFF orders" http://localhost:3000/shop/orders
check "BFF system" http://localhost:3000/shop/system

expect_blocked "raw order API through frontend" http://localhost:3000/api/order/orders
expect_blocked "catalog host port" http://localhost:8002/products
expect_blocked "order host port" http://localhost:8003/orders

echo "Private-mode smoke test passed."
