@echo off
setlocal EnableDelayedExpansion
title CodexOS Installer Bootstrapper

:: Enforce UTF-8 output
chcp 65001 >nul

:: Check PowerShell availability
where powershell.exe >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] PowerShell is required to run this installer.
    pause
    exit /b 1
)

:: Intercept help requests
if "%~1"=="-Help" goto :DO_HELP
if "%~1"=="-help" goto :DO_HELP
if "%~1"=="--help" goto :DO_HELP
if "%~1"=="-h" goto :DO_HELP
if "%~1"=="/?" goto :DO_HELP
if "%~1"=="-?" goto :DO_HELP
goto :DO_RUN

:DO_HELP
set "SCRIPT_PATH=%~dp0scripts\Install-CodexOS.ps1"
if exist "%SCRIPT_PATH%" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" -Help
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; iex (iwr -UseBasicParsing 'https://raw.githubusercontent.com/CodeSorcerer-007/CodexOS/main/scripts/Install-CodexOS.ps1') -Help"
)
exit /b 0

:DO_RUN
echo ============================================================
echo               CODEXOS WINDOWS BOOTSTRAPPER                  
echo     Lightweight Developer File Manager ^& Control Center    
echo ============================================================
echo.

:: Locate local or fallback installer script
set "SCRIPT_PATH=%~dp0scripts\Install-CodexOS.ps1"
if exist "%SCRIPT_PATH%" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" %*
    set "EXIT_CODE=!ERRORLEVEL!"
) else (
    echo [INFO] Local script not found. Launching remote bootstrap installer...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
        "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13; iex (iwr -UseBasicParsing 'https://raw.githubusercontent.com/CodeSorcerer-007/CodexOS/main/scripts/Install-CodexOS.ps1') %*"
    set "EXIT_CODE=!ERRORLEVEL!"
)

if !EXIT_CODE! neq 0 (
    echo.
    echo [ERROR] Installation exited with code !EXIT_CODE!.
    pause
    exit /b !EXIT_CODE!
)

echo.
echo [DONE] Setup finished.
pause
exit /b 0
