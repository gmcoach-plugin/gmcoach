@echo off
setlocal
title GM Coach - Claude
echo GM Coach - instalacja dla Claude / installer for Claude
echo.
echo   [1] Polski
echo   [2] English
choice /c 12 /n /m "Jezyk / Language (1/2): "
if errorlevel 2 (set "gmLang=en") else (set "gmLang=pl")
echo.
if not exist "%~dp0install-claude-windows.ps1" goto :missing
if not exist "%~dp0marketplace\gm-coach\.claude-plugin\plugin.json" goto :missing
if "%gmLang%"=="en" (
  echo Installing or updating GM Coach for Claude for the current user.
  echo Full guide: README-CLAUDE-EN.md
) else (
  echo Instalacja lub aktualizacja GM Coach dla Claude dla biezacego uzytkownika.
  echo Pelna instrukcja: README-CLAUDE.md
)
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-claude-windows.ps1" -Language %gmLang% %*
set "gmCoachInstallExit=%ERRORLEVEL%"
echo.
if "%gmCoachInstallExit%"=="0" (
  if "%gmLang%"=="en" (echo The installer finished. Read the messages above.) else (echo Instalator zakonczyl prace. Przeczytaj komunikaty powyzej.)
) else (
  if "%gmLang%"=="en" (echo Installation not completed. Error code: %gmCoachInstallExit%. See the Problems section in README-CLAUDE-EN.md.) else (echo Instalacja nie zostala ukonczona. Kod bledu: %gmCoachInstallExit%. Zobacz sekcje Problemy w README-CLAUDE.md.)
)
pause
exit /b %gmCoachInstallExit%

:missing
if "%gmLang%"=="en" (
  echo ERROR: install-claude-windows.ps1 or the marketplace folder is missing next to this file.
  echo This file was started directly from the ZIP archive or without the rest of the package.
  echo Right-click the ZIP, choose "Extract All...",
  echo then run START-CLAUDE-WINDOWS.cmd from the extracted folder.
) else (
  echo BLAD: Brak install-claude-windows.ps1 lub folderu marketplace obok tego pliku.
  echo Ten plik uruchomiono prosto z archiwum ZIP albo bez reszty paczki.
  echo Kliknij ZIP prawym przyciskiem, wybierz "Wyodrebnij wszystko...",
  echo a potem uruchom START-CLAUDE-WINDOWS.cmd z rozpakowanego folderu.
)
pause
exit /b 1
