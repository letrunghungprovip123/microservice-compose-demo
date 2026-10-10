@echo off
setlocal

set BASE_URL=%~1
if "%BASE_URL%"=="" set BASE_URL=%BASE_URL_ENV%

if "%BASE_URL%"=="" (
  echo Usage: scripts\smoke-test.cmd https://xxxx.ngrok.app
  exit /b 2
)

call :check "frontend BFF health through ngrok" %BASE_URL%/health || exit /b 1
call :check "BFF products through ngrok" %BASE_URL%/shop/products || exit /b 1
call :check "BFF orders through ngrok" %BASE_URL%/shop/orders || exit /b 1
call :check "BFF system through ngrok" %BASE_URL%/shop/system || exit /b 1

call :expect_blocked "raw order API through public BFF" %BASE_URL%/api/order/orders || exit /b 1
call :expect_blocked "raw catalog API through public BFF" %BASE_URL%/api/catalog/products || exit /b 1
call :expect_blocked "frontend host port bypass" http://localhost:3000 || exit /b 1
call :expect_blocked "catalog host port" http://localhost:8002/products || exit /b 1
call :expect_blocked "order host port" http://localhost:8003/orders || exit /b 1

echo.
echo Private-mode ngrok smoke test passed.
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
