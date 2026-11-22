# Instalacja ręczna (dla zaawansowanych)

Wybierz ten sposób, jeśli wolisz zainstalować GM Coach jako zwykły plugin, bez instalatora. Możesz też poprosić Codex albo Claude Code, żeby wykonał te kroki za Ciebie.

## 1. Przygotuj folder pluginu

Potrzebujesz **Node.js 24** ([nodejs.org](https://nodejs.org)) i kodu źródłowego z [najnowszego wydania](https://github.com/gmcoach-plugin/gmcoach/releases/latest).

1. Skopiuj folder `plugin` z repozytorium do `~/.codex/plugins/gm-coach`. Z tego folderu mogą korzystać zarówno Codex, jak i Claude.

   ```powershell
   # Windows (PowerShell)
   Copy-Item -Recurse .\plugin "$env:USERPROFILE\.codex\plugins\gm-coach"
   ```

   ```bash
   # macOS / Linux
   mkdir -p ~/.codex/plugins && cp -R plugin ~/.codex/plugins/gm-coach
   ```

2. Pobierz `speediance-cli` dla swojego systemu ze [strony wydań programu](https://github.com/stozo04/speediance-cli/releases/latest) i umieść go w podfolderze `bin` (`bin\speediance-cli.exe` na Windows, `bin/speediance-cli` na macOS i Linuksie). Na macOS i Linuksie wykonaj `chmod +x bin/speediance-cli`.

3. W folderze pluginu zainstaluj moduł magazynu haseł dla swojego systemu:

   ```powershell
   # Windows
   node scripts/install-keyring-runtime.mjs --root . --platform win32 --arch x64
   ```

   ```bash
   # macOS (Apple Silicon; na Intelu użyj --arch x64)
   node scripts/install-keyring-runtime.mjs --root . --platform darwin --arch arm64
   # Linux (na ARM użyj --arch arm64, na Alpine --libc musl)
   node scripts/install-keyring-runtime.mjs --root . --platform linux --arch x64 --libc gnu
   ```

## 2a. Dodaj plugin do Codexa

1. Otwórz `~/.agents/plugins/marketplace.json` (utwórz go, jeśli nie istnieje) i dodaj GM Coach do listy `plugins`:

   ```json
   {
     "name": "personal",
     "interface": { "displayName": "Personal" },
     "plugins": [
       {
         "name": "gm-coach",
         "source": { "source": "local", "path": "./.codex/plugins/gm-coach" },
         "policy": { "installation": "AVAILABLE", "authentication": "ON_INSTALL" },
         "category": "Health & Fitness"
       }
     ]
   }
   ```

2. Uruchom `codex plugin add gm-coach@personal` albo w Codexie otwórz listę pluginów, wybierz **Personal**, a potem **GM Coach** i go włącz.
3. Uruchom Codex ponownie.

## 2b. Dodaj plugin do Claude

**Claude Code** (Windows, macOS i Linux):

```powershell
# Windows
claude mcp add --scope user gm-coach -- node "$env:USERPROFILE\.codex\plugins\gm-coach\mcp_server.mjs"
```

```bash
# macOS / Linux
claude mcp add --scope user gm-coach -- node "$HOME/.codex/plugins/gm-coach/mcp_server.mjs"
```

**Claude Desktop** (Windows i macOS): dodaj GM Coach do pliku `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`), podając pełną ścieżkę do `mcp_server.mjs`, a potem uruchom Claude ponownie:

```json
{
  "mcpServers": {
    "gm-coach": { "command": "node", "args": ["/pelna/sciezka/do/.codex/plugins/gm-coach/mcp_server.mjs"] }
  }
}
```

Potem otwórz nowy czat i napisz: *„GM Coach, pomóż mi połączyć moje konto Speediance”.* Aby zaktualizować plugin, zastąp jego folder nową wersją i uruchom aplikację ponownie. Konto i profil treningowy zostaną zachowane.
