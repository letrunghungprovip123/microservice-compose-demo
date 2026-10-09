@echo off
setlocal

call :check "frontend BFF health" http://localhost:3000/health || exit /b 1
call :check "BFF products" http://localhost:3000/shop/products || exit /b 1
call :check "BFF orders" http://localhost:3000/shop/orders || exit /b 1
call :check "BFF system" http://localhost:3000/shop/system || exit /b 1

call :expect_blocked "raw order API through frontend" http://localhost:3000/api/order/orders || exit /b 1
call :expect_blocked "catalog host port" http://localhost:8002/products || exit /b 1
call :expect_blocked "order host port" http://localhost:8003/orders || exit /b 1

echo.
echo Private-mode smoke test passed.
exit /b 0

:check
echo [CHECK] %~1
curl -fsS %~2 >nul
if errorlevel 1 (
  echo [FAIL] %~1
  exit /b 1
)
echo [OK] %~1
exit /b 0

:expect_blocked
echo [EXPECT BLOCKED] %~1
curl -fsS --max-time 3 %~2 >nul 2>nul
if not errorlevel 1 (
  echo [FAIL] %~1 was unexpectedly reachable
  exit /b 1
)
echo [OK] blocked as expected
exit /b 0
