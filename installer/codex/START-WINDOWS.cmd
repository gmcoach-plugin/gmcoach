@echo off
setlocal
set "gmCoachLang=pl"
echo Jezyk / Language: [1] Polski  [2] English
choice /c 12 /n /m "Wybierz / Choose [1,2]: "
if errorlevel 2 set "gmCoachLang=en"
echo.
if /i "%gmCoachLang%"=="en" goto :msg_en
title GM Coach - instalacja dla Windows
echo GM Coach - instalacja lub aktualizacja dla biezacego uzytkownika
echo Rozpakuj cale archiwum przed uruchomieniem.
echo Instalacja wymaga internetu oraz zainstalowanego Codex.
echo Instalator zapyta, czy dodac opcjonalny tunel do ChatGPT. Enter = nie.
set "gmCoachMsgNoInstaller=BLAD: Brak install-windows.ps1. Rozpakuj cale archiwum ZIP: prawy klik na ZIP, Wyodrebnij wszystko..."
set "gmCoachMsgNoPlugin=BLAD: Brak folderu plugin. Rozpakuj cale archiwum ZIP: prawy klik na ZIP, Wyodrebnij wszystko..."
set "gmCoachMsgDone1=Instalator zakonczyl prace. Sprawdz komunikaty aktywacji powyzej."
set "gmCoachMsgDone2=Wybierz GM Coach w nowym czacie i sprawdz lokalna diagnostyke."
set "gmCoachMsgFail1=Instalacja nie zostala ukonczona. Kod bledu:"
set "gmCoachMsgFail2=Rozwiazanie znajdziesz w README-INSTALACJA.md."
goto :checks
:msg_en
title GM Coach - Windows installation
echo GM Coach - install or update for the current user
echo Extract the whole archive before running.
echo Installation requires internet access and an installed Codex.
echo The installer asks whether to add the optional ChatGPT tunnel. Enter = no.
set "gmCoachMsgNoInstaller=ERROR: install-windows.ps1 is missing. Extract the whole ZIP archive: right-click the ZIP, Extract All..."
set "gmCoachMsgNoPlugin=ERROR: The plugin folder is missing. Extract the whole ZIP archive: right-click the ZIP, Extract All..."
set "gmCoachMsgDone1=The installer has finished. Check the activation messages above."
set "gmCoachMsgDone2=Select GM Coach in a new chat and check the local diagnostics."
set "gmCoachMsgFail1=Installation was not completed. Error code:"
set "gmCoachMsgFail2=See README-INSTALL-EN.md for troubleshooting."
:checks
echo.
if not exist "%~dp0install-windows.ps1" (
  echo %gmCoachMsgNoInstaller%
  pause
  exit /b 1
)
if not exist "%~dp0plugin\plugin.json" (
  echo %gmCoachMsgNoPlugin%
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-windows.ps1" -Language %gmCoachLang%
set "gmCoachInstallExit=%ERRORLEVEL%"
echo.
if "%gmCoachInstallExit%"=="0" (
  echo %gmCoachMsgDone1%
  echo %gmCoachMsgDone2%
) else (
  echo %gmCoachMsgFail1% %gmCoachInstallExit%
  echo %gmCoachMsgFail2%
)
pause
exit /b %gmCoachInstallExit%