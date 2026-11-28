@echo off
setlocal
set "gmCoachLang=pl"
echo Jezyk / Language: [1] Polski  [2] English
choice /c 12 /n /m "Wybierz / Choose [1,2]: "
if errorlevel 2 set "gmCoachLang=en"
echo.
if /i "%gmCoachLang%"=="en" goto :msg_en
title GM Coach - aktualizacja (Codex)
echo GM Coach - aktualizacja pluginu dla Codex
echo Rozpakuj cale archiwum przed uruchomieniem.
echo Zostaje: Node, speediance-cli, dane, haslo i ustawienia tunelu. Nie trzeba logowac sie ponownie.
set "gmMsgNoFiles=BLAD: Brak update-windows.ps1 lub folderu plugin. Rozpakuj cale archiwum ZIP: prawy klik na ZIP, Wyodrebnij wszystko..."
set "gmMsgOk=Aktualizator zakonczyl prace."
set "gmMsgNothing=Nic nie zmieniono (ta wersja jest juz zainstalowana lub plugin nie jest zainstalowany)."
set "gmMsgWarn=Pliki zaktualizowane; sprawdz komunikat o aktywacji powyzej."
set "gmMsgFail=Aktualizacja nie powiodla sie; poprzednia wersja zostala zachowana. Kod:"
goto :checks
:msg_en
title GM Coach - update (Codex)
echo GM Coach - plugin update for Codex
echo Extract the whole archive before running.
echo Kept: Node, speediance-cli, data, password and tunnel settings. No new sign-in is needed.
set "gmMsgNoFiles=ERROR: update-windows.ps1 or the plugin folder is missing. Extract the whole ZIP archive: right-click the ZIP, Extract All..."
set "gmMsgOk=The updater has finished."
set "gmMsgNothing=Nothing changed (this version is already installed, or the plugin is not installed)."
set "gmMsgWarn=Files updated; see the activation message above."
set "gmMsgFail=The update failed; the previous version was kept. Code:"
:checks
echo.
if not exist "%~dp0update-windows.ps1" goto :nofiles
if not exist "%~dp0plugin\plugin.json" goto :nofiles
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-windows.ps1" -Language %gmCoachLang%
set "gmExit=%ERRORLEVEL%"
echo.
if "%gmExit%"=="0" (echo %gmMsgOk%) else if "%gmExit%"=="2" (echo %gmMsgNothing%) else if "%gmExit%"=="3" (echo %gmMsgWarn%) else (echo %gmMsgFail% %gmExit%)
pause
exit /b %gmExit%
:nofiles
echo %gmMsgNoFiles%
pause
exit /b 1
