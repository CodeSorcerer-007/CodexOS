@echo off
title CodexOS Launcher
echo Starting CodexOS...

:: Add Rust to PATH
set PATH=%USERPROFILE%\.cargo\bin;%PATH%

:: Change to project directory
cd /d "%~dp0"

:: Run tauri dev (starts Vite + Rust backend + opens window)
npm run tauri dev

pause
