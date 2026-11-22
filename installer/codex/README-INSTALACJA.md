# GM Coach dla Codex — instalacja

English: `README-INSTALL-EN.md`

## 1. Wymagania

- Codex zainstalowany na Windows, macOS albo Linux. Musisz być w nim zalogowany.
- Polecenie `codex` w terminalu. Dzięki niemu instalator sam włączy plugin. Bez niego zobacz krok 7.
- Internet. Instalator pobiera Node.js, Speediance CLI i potrzebne moduły, a potem sprawdza ich sumy kontrolne.

## 2. Rozpakowanie

Kliknij plik ZIP prawym przyciskiem, wybierz **Wyodrębnij wszystko…** i pracuj w rozpakowanym folderze.

## 3. Instalacja

**Windows:** kliknij dwukrotnie `START-WINDOWS.cmd` i wybierz język.

**macOS / Linux:** w Terminalu, w rozpakowanym folderze:

```bash
bash install-macos.sh --language pl   # macOS
bash install-linux.sh --language pl   # Linux
```

Na Windows możesz też użyć PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Language pl`

Na końcu instalator zapyta, czy używać GM Coach także w ChatGPT. Jeśli korzystasz tylko z Codex, naciśnij **Enter**. Tunel opisuje krok 5.

Następnie zamknij Codex i uruchom go ponownie.

## 4. Pierwsze uruchomienie

1. W nowym czacie Codex wybierz **GM Coach**.
2. Sprawdź, czy działa nowa wersja: **„GM Coach, pokaż lokalną diagnostykę wersji”**. Wersje w wyniku powinny być zgodne, a wartość `restartRequired` powinna wynosić `false`.
3. Połącz konto: **„GM Coach, pomóż mi połączyć moje konto Speediance”**. Otwórz link, który poda GM Coach, i wpisz e-mail, hasło oraz region. Nie podawaj hasła w czacie.

Hasło jest przechowywane w systemowym magazynie haseł: w Menedżerze poświadczeń Windows, Pęku kluczy macOS albo Secret Service na Linux.

## 5. Tunel do ChatGPT (opcjonalnie)

Pomiń ten krok, jeśli używasz GM Coach tylko w Codex. Tunel udostępnia GM Coach z Twojego komputera w ChatGPT. Komputer musi być wtedy włączony i podłączony do internetu.

1. Na [platform.openai.com](https://platform.openai.com) utwórz tunel i skopiuj jego ID (`tunnel_...`).
2. Utwórz klucz z uprawnieniem **Tunnels: Read + Use**.
3. Podczas instalacji z kroku 3 odpowiedz **t** na pytanie o ChatGPT. Wklej ID tunelu, a potem klucz. Klucz nie będzie widoczny podczas wklejania.
4. Otwórz w przeglądarce [chatgpt.com](https://chatgpt.com). W ustawieniach dodaj własny serwer MCP, wybierz połączenie **Tunnel** i wklej ID tunelu. Administrator workspace musi zezwalać na własne serwery MCP.

   Wykonaj ten krok **tylko w przeglądarce na chatgpt.com**. Okno „Połącz z niestandardowym MCP” w aplikacji Codex nie ma opcji Tunnel i nie służy do tego.

Instalator zapisze klucz w bezpiecznym magazynie systemu i ustawi automatyczne uruchamianie tunelu po zalogowaniu. Na końcu wyświetli polecenie `tunnel-client health ...`, którym sprawdzisz tunel.

Jeśli GM Coach jest już zainstalowany, tunel możesz dodać albo zmienić później:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -SkipPlugin -Tunnel
```

```bash
bash install-macos.sh --skip-plugin --tunnel   # macOS
bash install-linux.sh --skip-plugin --tunnel   # Linux
```

Szczegóły znajdziesz w [dokumentacji OpenAI](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## 6. Aktualizacja

Zamknij Codex, rozpakuj nową wersję i uruchom instalację tak jak w kroku 3. Konto, profil treningowy i skonfigurowany tunel pozostaną bez zmian. Jeśli tunel jest już skonfigurowany, instalator nie zapyta o niego ponownie. Potem uruchom Codex i sprawdź diagnostykę w nowym czacie.

## 7. Problemy

| Problem | Co zrobić |
|---|---|
| Brak folderu `plugin` | Rozpakuj całe archiwum. |
| „codex nie został znaleziony” albo GM Coach nie ma na liście | Otwórz w Codex listę pluginów, wybierz **Personal**, potem **GM Coach** i go włącz. |
| „Odmowa dostępu” przy aktualizacji | Zamknij Codex i uruchom instalację ponownie. |
| Diagnostyka pokazuje starą wersję | Zamknij i otwórz Codex, potem otwórz nowy czat. |
| GM Coach nie działa w ChatGPT | Sprawdź, czy komputer jest włączony, i uruchom polecenie `health` z kroku 5. |
| Błąd zapisu hasła | Sprawdź, czy systemowy magazyn haseł działa. |

## 8. Odinstalowanie

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Uninstall
```

```bash
bash install-macos.sh --uninstall   # macOS
bash install-linux.sh --uninstall   # Linux
```

Odinstalowanie usuwa plugin i tunel. Dane konta zostają na komputerze. Żeby usunąć także je, dodaj `-RemoveData` na Windows albo `--remove-data` na macOS/Linux. Klucz tunelu unieważnij osobno na platform.openai.com.
