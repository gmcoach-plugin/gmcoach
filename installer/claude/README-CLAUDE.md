# GM Coach dla Claude — instalacja

English: `README-CLAUDE-EN.md`

## Wymagania

- Windows 10/11 i aplikacja **Claude**, w której jesteś zalogowany.
- Zakładka **Code** otwarta w Claude co najmniej raz. To instaluje Claude Code, którego używa instalator.

Wersja dla Windows zawiera wszystko, czego potrzebuje, i instaluje się bez internetu.

## Instalacja

1. Kliknij plik ZIP prawym przyciskiem, wybierz **Wyodrębnij wszystko…** i otwórz rozpakowany folder.
2. Kliknij dwukrotnie `START-CLAUDE-WINDOWS.cmd` i wybierz język.
3. Otwórz nowy czat w Claude.

GM Coach pojawi się w panelu wtyczek jako **„Gm coach — Installed locally”**. Działa w czatach i w zakładce Code.

## Pierwsze uruchomienie

- **Jeśli GM Coach działa już na tym komputerze w Codex,** Claude użyje tego samego konta. Napisz: **„GM Coach, sprawdź połączenie mojego konta”**.
- **W przeciwnym razie** napisz: **„GM Coach, pomóż mi połączyć moje konto Speediance”**. Otwórz podany link, wybierz język formularza, a potem wpisz e-mail, hasło i region. Na koniec wróć do czatu i napisz **„gotowe”**.

Hasło trafia do Menedżera poświadczeń Windows. Nie podawaj go w czacie.

## Aktualizacja

Rozpakuj nową wersję i ponownie uruchom `START-CLAUDE-WINDOWS.cmd`. Claude może być w tym czasie otwarty. Potem otwórz nowy czat. Konto i profil treningowy pozostaną bez zmian.

## Inne przypadki

**Brak zakładki Code w Claude.** Zainstaluj GM Coach jako rozszerzenie:

1. W rozpakowanym folderze uruchom: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1 -BezCode`
2. W Claude wybierz **Settings → Extensions → Advanced settings → Install Extension…** i wskaż plik `.mcpb` pokazany przez instalator.
3. W nowym czacie włącz GM Coach w menu narzędzi.

Jeśli masz zakładkę Code, nie instaluj pliku `.mcpb`. Uruchomiłbyś wtedy drugi, zdublowany serwer.

**macOS i Linux.** Potrzebny jest Claude Code, czyli polecenie `claude`, oraz internet. W Terminalu, w rozpakowanym folderze:

```bash
bash install-claude-macos.sh --language pl   # macOS
bash install-claude-linux.sh --language pl   # Linux
```

## Problemy

| Problem | Co zrobić |
|---|---|
| Brak pliku instalatora albo folderu `marketplace` | Rozpakuj całe archiwum ZIP. |
| „Nie znaleziono Claude Code” | Otwórz raz zakładkę **Code** w Claude i spróbuj ponownie albo użyj sposobu bez zakładki Code. |
| GM Coach nie działa w czacie | Otwórz nowy czat i sprawdź, czy **„Gm coach”** jest w panelu wtyczek w sekcji *Active*. |
| Stara wersja po aktualizacji | Zamknij i otwórz Claude, potem otwórz nowy czat. |
| Błąd zapisu hasła | Sprawdź Menedżera poświadczeń Windows. |

## Odinstalowanie

W rozpakowanym folderze uruchom: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1 -Uninstall`

Rozszerzenie `.mcpb`, jeśli było instalowane, usuń w **Settings → Extensions**. Dane konta zostają na komputerze, bo korzysta z nich także Codex.
