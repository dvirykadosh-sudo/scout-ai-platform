@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maoz WhatsApp Bridge

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org , install it, and run this file again.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0])>=22?0:1)"
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install the latest LTS from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing components. First run only, this can take a few minutes...
  call npm install
  if errorlevel 1 (
    echo Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting the bridge. Keep this window open while you use the WhatsApp center.
echo Google Chrome must be installed on this computer.
echo.
node src\index.js
echo.
echo The bridge stopped. Run this file again to restart it.
pause
