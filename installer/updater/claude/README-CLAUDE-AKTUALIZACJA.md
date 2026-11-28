# GM Coach - aktualizacja dla Claude

Ta paczka jest dla osob, ktore **juz maja** wtyczke GM Coach w Claude Code (zakladka Code w aplikacji Claude lub CLI `claude`).
Podmienia tylko pliki wtyczki w `~/.claude/gm-coach`. Zostaja: Node.js, speediance-cli, magazyn hasel (node_modules),
plik `.mcp.json`, Twoje dane i profil oraz haslo Speediance. **Nic nie jest pobierane i nie trzeba logowac sie ponownie.**

Masz tylko rozszerzenie `.mcpb` w Claude Desktop (bez Claude Code)? Aktualizator go nie obsluguje - zainstaluj nowy plik `.mcpb` z paczki instalacyjnej (Settings > Extensions).

## Windows

1. Rozpakuj cale archiwum ZIP (prawy klik, Wyodrebnij wszystko).
2. Zamknij aplikacje Claude (zalecane).
3. Uruchom `UPDATE-CLAUDE-WINDOWS.cmd`, wybierz jezyk.
4. Otworz nowa sesje Claude Code lub nowy czat.

## macOS

`bash update-claude-macos-linux.sh` (albo dwuklik na `UPDATE-CLAUDE-MACOS.command`; jesli system blokuje plik: prawy klik, Otworz).

## Linux

`bash update-claude-macos-linux.sh`

## Co robi aktualizator

1. Sprawdza zainstalowana wersje (ta sama lub nowsza: nic nie zmienia; `-Force` / `--force` wymusza).
2. Sprawdza, czy sa wszystkie skladniki. Jesli czegos brakuje albo nowa wersja wymaga innych skladnikow, konczy sie kodem 4 i prosi o pelny instalator.
3. Tworzy kopie zapasowa (`~/.claude/gm-coach/backup-*`, dwie ostatnie), podmienia pliki, aktualizuje wersje w marketplace.
4. Uruchamia nowy serwer i sprawdza `initialize` oraz `tools/list`. Gdy to sie nie uda, **przywraca poprzednia wersje**.
5. Wywoluje `claude plugin marketplace update` i `claude plugin update`. Gdy CLI nie ma, zaktualizuj wtyczke w panelu wtyczek Claude.

Sprawdzenie bez zmian: `-CheckOnly` / `--check-only`.

## Kody wyjscia

0 - gotowe; 1 - blad, przywrocono poprzednia wersje; 2 - nic do zrobienia; 3 - pliki zaktualizowane, ale nie uruchomiono `claude plugin update`
(zaktualizuj wtyczke w panelu Claude); 4 - potrzebny pelny instalator.
