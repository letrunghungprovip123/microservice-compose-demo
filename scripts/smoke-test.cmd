@echo off
setlocal

call :check "frontend health" http://localhost:3000/health || exit /b 1
call :check "customer health" http://localhost:8001/health || exit /b 1
call :check "catalog health" http://localhost:8002/health || exit /b 1
call :check "order health" http://localhost:8003/health || exit /b 1
call :check "frontend -> customer" http://localhost:3000/api/customer/health || exit /b 1
call :check "frontend -> catalog" http://localhost:3000/api/catalog/health || exit /b 1
call :check "frontend -> order" http://localhost:3000/api/order/health || exit /b 1
call :check "customer dependencies" http://localhost:3000/api/customer/dependencies || exit /b 1
call :check "catalog dependencies" http://localhost:3000/api/catalog/dependencies || exit /b 1
call :check "order dependencies" http://localhost:3000/api/order/dependencies || exit /b 1

echo Smoke test passed.
exit /b 0

:check
set NAME=%~1
set URL=%~2
<nul set /p="%NAME% ... "
curl -fsS %URL% >nul
if errorlevel 1 (
  echo FAIL
  exit /b 1
)
echo OK
exit /b 0
