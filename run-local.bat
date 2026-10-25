@echo off
setlocal
cd /d "%~dp0"
title Maoz Activity Generator - server
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download version 22.5 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

rem ---- first run: create settings file (one time) ----
if exist config.local.bat goto haveconfig
echo.
echo  First run. Choose settings for the site. They are saved in config.local.bat.
echo.
set /p ADMINPW=  Admin password (choose a strong one): 
set /p SIGNUP=  Signup code for instructors (they type it when registering): 
for /f %%i in ('node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"') do set JWT=%%i
> config.local.bat echo set NODE_ENV=production
>> config.local.bat echo set PORT=4000
>> config.local.bat echo set DB_PATH=%~dp0data\scout.db
>> config.local.bat echo set BACKUP_DIR=%~dp0data\backups
>> config.local.bat echo set JWT_SECRET=%JWT%
>> config.local.bat echo set ADMIN_PASSWORD=%ADMINPW%
>> config.local.bat echo set SIGNUP_CODE=%SIGNUP%
:haveconfig
call config.local.bat
if not exist data mkdir data

rem ---- build once (and again after an update, when build folder is deleted) ----
if exist backend\public\index.html goto built
echo Building the site. This takes a few minutes the first time...
node run.mjs build-prod
if errorlevel 1 goto buildfail
:built

goto start
:buildfail
echo Build failed. Send a screenshot of this window.
pause
exit /b 1
:start
echo.
echo  The site is starting. Keep this window open.
echo  On this computer:      http://localhost:4000
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo  From phones on the same Wi-Fi:  http://%%a:4000
echo.
start "" http://localhost:4000
node backend\src\all.js
echo.
echo  The server stopped. See the message above.
pause
