@echo off
setlocal
title GM Coach - Claude update
echo GM Coach - aktualizacja dla Claude / update for Claude
echo.
echo   [1] Polski
echo   [2] English
choice /c 12 /n /m "Jezyk / Language (1/2): "
if errorlevel 2 (set "gmLang=en") else (set "gmLang=pl")
echo.
if /i "%gmLang%"=="en" goto :msg_en
echo Rozpakuj cale archiwum przed uruchomieniem.
echo Zostaje: Node, speediance-cli, dane, haslo i konfiguracja. Nic nie jest pobierane; nie trzeba logowac sie ponownie.
set "gmMsgNoFiles=BLAD: Brak update-claude-windows.ps1 lub folderu gm-coach. Rozpakuj cale archiwum ZIP: prawy klik na ZIP, Wyodrebnij wszystko..."
set "gmMsgOk=Aktualizator zakonczyl prace."
set "gmMsgNothing=Nic nie zmieniono (ta wersja jest juz zainstalowana albo wtyczka nie jest zainstalowana)."
set "gmMsgWarn=Pliki zaktualizowane; zaktualizuj wtyczke w panelu wtyczek Claude (komunikat powyzej)."
set "gmMsgFull=Potrzebny jest pelny instalator (START-CLAUDE-WINDOWS.cmd): zmieniono skladniki albo ich brakuje."
set "gmMsgFail=Aktualizacja nie powiodla sie; poprzednia wersja zostala zachowana. Kod:"
goto :checks
:msg_en
echo Extract the whole archive before running.
echo Kept: Node, speediance-cli, data, password and config. Nothing is downloaded; no new sign-in is needed.
set "gmMsgNoFiles=ERROR: update-claude-windows.ps1 or the gm-coach folder is missing. Extract the whole ZIP archive: right-click the ZIP, Extract All..."
set "gmMsgOk=The updater has finished."
set "gmMsgNothing=Nothing changed (this version is already installed, or the plugin is not installed)."
set "gmMsgWarn=Files updated; update the plugin in the Claude plugins panel (see the message above)."
set "gmMsgFull=The full installer is needed (START-CLAUDE-WINDOWS.cmd): components changed or are missing."
set "gmMsgFail=The update failed; the previous version was kept. Code:"
:checks
echo.
if not exist "%~dp0update-claude-windows.ps1" goto :nofiles
if not exist "%~dp0gm-coach\.claude-plugin\plugin.json" goto :nofiles
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-claude-windows.ps1" -Language %gmLang%
set "gmExit=%ERRORLEVEL%"
echo.
if "%gmExit%"=="0" (echo %gmMsgOk%) else if "%gmExit%"=="2" (echo %gmMsgNothing%) else if "%gmExit%"=="3" (echo %gmMsgWarn%) else if "%gmExit%"=="4" (echo %gmMsgFull%) else (echo %gmMsgFail% %gmExit%)
pause
exit /b %gmExit%
:nofiles
echo %gmMsgNoFiles%
pause
exit /b 1
