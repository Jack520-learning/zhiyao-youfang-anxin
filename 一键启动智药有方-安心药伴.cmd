@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist "node_modules" (
  call npm install
  if errorlevel 1 pause & exit /b 1
)

call npm run build
if errorlevel 1 pause & exit /b 1

start "" "http://127.0.0.1:8788"
call npm start
pause
