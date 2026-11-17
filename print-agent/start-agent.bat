@echo off
rem Double-click this, or point a Startup-folder shortcut at it, to run the print agent and
rem have it restart itself if it ever crashes. Requires `npm run build` to have been run first
rem (produces dist\index.js).
cd /d "%~dp0"

:loop
node dist\src\index.js
echo.
echo Print agent exited - restarting in 5 seconds... (Ctrl+C twice to stop for good)
timeout /t 5 /nobreak >nul
goto loop
