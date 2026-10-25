@echo off
cd /d "%~dp0"
rem Starts the site automatically every time you log in to Windows (in a minimized window).
schtasks /create /tn "MaozActivityGenerator" /tr "cmd /c start /min \"\" \"%~dp0run-local.bat\"" /sc onlogon /f
if errorlevel 1 (
  echo Could not create the task. Right click this file and choose "Run as administrator".
) else (
  echo Done. The site will start by itself after you log in to Windows.
  echo To remove: schtasks /delete /tn "MaozActivityGenerator" /f
)
pause
