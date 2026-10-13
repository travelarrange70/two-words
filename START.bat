@echo off
title TwoWords - Master Launcher
cd /d "%~dp0"
echo.
echo   Starting TwoWords Master Environment...
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-TwoWordsEnvironment.ps1" %*
pause
