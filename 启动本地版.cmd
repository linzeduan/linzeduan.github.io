@echo off
setlocal
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 or newer first.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run pnpm install first.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:5173 in your browser.
echo Keep this window open. Press Ctrl+C to stop.
node scripts/local-dev.mjs
if errorlevel 1 pause
popd
