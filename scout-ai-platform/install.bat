@echo off
cd /d "%~dp0"
echo Installing and building (first time only, about 2-3 minutes)...
node run.mjs setup
pause
