@echo off
echo.
echo  Temporary public link for your site (start.bat must already be running)
echo.
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo  cloudflared is not installed. Install it once:
  echo     winget install --id Cloudflare.cloudflared
  echo  Then close this window, open a new one and run this file again.
  pause
  exit /b 1
)
echo  Look for the line ending with trycloudflare.com and send it to others.
echo  It works only while this window and this computer stay open.
echo.
cloudflared tunnel --url http://localhost:3000
pause
