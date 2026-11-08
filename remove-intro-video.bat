@echo off
rem Run from the project folder (the one that contains the frontend folder).
del /q "frontend\public\intro.mp4" "frontend\public\intro-poster.jpg" "frontend\public\intro.vtt" "frontend\src\components\HomeVideo.tsx"
rem Stray duplicate copies in the project root (not used by the build). Ignore errors if they do not exist.
del /q "public\intro.mp4" "public\intro-poster.jpg" "public\intro.vtt" "src\components\HomeVideo.tsx" 2>nul
echo Done.
pause
