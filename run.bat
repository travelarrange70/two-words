@echo off
title TwoWords - One-Click Launcher
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Run-TwoWords.ps1" %*
