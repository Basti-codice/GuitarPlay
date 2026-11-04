@echo off
rem GuitarPlay launcher for Windows: installs, builds and opens the app in your browser.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required. Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies ^(first start only^)...
  call npm install
)
if not exist dist (
  echo Building GuitarPlay...
  call npm run build
)
start "" http://localhost:4173
echo.
echo GuitarPlay is running at http://localhost:4173  ^(close this window to stop it^)
call npm run preview
