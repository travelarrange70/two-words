@echo off
title TwoWords - Full Stack Launcher
cd /d "%~dp0"
echo ======================================================
echo   Launching TwoWords Backend and Frontend...
echo ======================================================
echo.

:: Start the Node.js backend server in a separate window
start "TwoWords Backend Server" cmd /k "node server/server.js"

:: Wait 2 seconds for the server to bind to port 3000
timeout /t 2 /nobreak >nul

:: Open the frontend in the default browser
echo Opening frontend in default browser...
start http://localhost:3000

echo.
echo TwoWords is now running at http://localhost:3000!
echo Backend logs are running in the "TwoWords Backend Server" window.
echo.
