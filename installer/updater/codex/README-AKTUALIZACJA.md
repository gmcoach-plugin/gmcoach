# GM Coach - aktualizacja dla Codex

Ta paczka jest dla osob, ktore **juz maja** GM Coach w Codex. Podmienia tylko pliki pluginu.
Zostaja na miejscu i nie sa pobierane ponownie: prywatny Node.js, speediance-cli, magazyn hasel (node_modules),
Twoje dane i profil, haslo Speediance w magazynie systemu oraz ustawienia tunelu ChatGPT.
**Nie trzeba logowac sie ponownie.** Nie masz jeszcze GM Coach? Uzyj paczki instalacyjnej.

## Windows

1. Rozpakuj cale archiwum ZIP (prawy klik, Wyodrebnij wszystko).
2. Zamknij Codex (zalecane).
3. Uruchom `UPDATE-WINDOWS.cmd`, wybierz jezyk.
4. Otworz Codex i nowy czat.

## macOS

1. Rozpakuj archiwum i zamknij Codex.
2. Terminal: `bash update-macos-linux.sh` (albo dwuklik na `UPDATE-MACOS.command`; jesli system blokuje plik: prawy klik, Otworz).
3. Otworz Codex i nowy czat.

## Linux

`bash update-macos-linux.sh`

## Co robi aktualizator

1. Sprawdza zainstalowana wersje. Ta sama lub nowsza wersja: nic nie zmienia (`-Force` / `--force` wymusza).
2. Tworzy kopie zapasowa poprzedniej wersji (obok pluginu, katalog `.gm-coach-backup-*`).
3. Podmienia pliki pluginu; istniejacy Node, CLI i keyring sa uzywane ponownie. Pobiera tylko to, czego brakuje (z weryfikacja SHA-256).
4. Uruchamia nowy serwer i sprawdza `initialize` oraz `tools/list`. Gdy to sie nie uda, **przywraca poprzednia wersje**.
5. Tunel ChatGPT jest na chwile zatrzymany i uruchomiony ponownie; jego ustawienia nie sa zmieniane.

Sprawdzenie bez zmian: `update-windows.ps1 -CheckOnly` albo `bash update-macos-linux.sh --check-only`.

## Kody wyjscia

0 - gotowe; 1 - blad, przywrocono poprzednia wersje; 2 - nic do zrobienia (ta sama/nowsza wersja albo brak instalacji);
3 - pliki zaktualizowane, ale Codex CLI nie potwierdzil aktywacji (zrestartuj Codex; w razie braku narzedzi uzyj pelnego instalatora).

## Gdy cos pojdzie nie tak

Poprzednia wersja jest w `.gm-coach-backup-*` w folderze `.codex/plugins`. Dane konta nie sa ruszane.
Mozesz tez uruchomic pelny instalator - zachowa dane i ustawienia.
