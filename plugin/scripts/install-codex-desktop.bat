@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-codex-desktop.ps1" %*
set "installExitCode=%ERRORLEVEL%"
if not "%installExitCode%"=="0" (
  echo.
  echo GM Coach installation stopped. Read the message above and try again.
)
echo.
if not "%GM_COACH_NO_PAUSE%"=="1" pause
exit /b %installExitCode%
