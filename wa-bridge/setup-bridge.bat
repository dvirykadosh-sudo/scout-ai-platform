@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Maoz WhatsApp Bridge - setup

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

echo You will be asked for the site address and the bridge token.
echo Create the token in the site: WhatsApp center - Overview - Bridge to computer.
echo Do not send the token to anyone.
echo.
node src\setup.js
echo.
pause
