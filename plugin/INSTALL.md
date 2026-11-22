# Manual installation (advanced)

Use this if you prefer to install GM Coach as a plain plugin without the installer. You can also ask Codex or Claude Code to follow these steps for you.

## 1. Prepare the plugin folder

You need **Node.js 24** ([nodejs.org](https://nodejs.org)) and the source code of the [latest release](https://github.com/gmcoach-plugin/gmcoach/releases/latest).

1. Copy the `plugin` folder from the repository to `~/.codex/plugins/gm-coach`. Codex and Claude can both use this folder.

   ```powershell
   # Windows (PowerShell)
   Copy-Item -Recurse .\plugin "$env:USERPROFILE\.codex\plugins\gm-coach"
   ```

   ```bash
   # macOS / Linux
   mkdir -p ~/.codex/plugins && cp -R plugin ~/.codex/plugins/gm-coach
   ```

2. Download `speediance-cli` for your system from [its releases page](https://github.com/stozo04/speediance-cli/releases/latest) and put the program in the `bin` subfolder (`bin\speediance-cli.exe` on Windows, `bin/speediance-cli` on macOS and Linux). On macOS and Linux, run `chmod +x bin/speediance-cli`.

3. In the plugin folder, install the password store module for your system:

   ```powershell
   # Windows
   node scripts/install-keyring-runtime.mjs --root . --platform win32 --arch x64
   ```

   ```bash
   # macOS (Apple Silicon; use --arch x64 on Intel)
   node scripts/install-keyring-runtime.mjs --root . --platform darwin --arch arm64
   # Linux (use --arch arm64 on ARM, --libc musl on Alpine)
   node scripts/install-keyring-runtime.mjs --root . --platform linux --arch x64 --libc gnu
   ```

## 2a. Add the plugin to Codex

1. Open `~/.agents/plugins/marketplace.json` (create it if it does not exist) and add GM Coach to the `plugins` list:

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

2. Run `codex plugin add gm-coach@personal`, or in Codex open the plugin list, choose **Personal**, then **GM Coach**, and enable it.
3. Restart Codex.

## 2b. Add the plugin to Claude

**Claude Code** (Windows, macOS and Linux):

```powershell
# Windows
claude mcp add --scope user gm-coach -- node "$env:USERPROFILE\.codex\plugins\gm-coach\mcp_server.mjs"
```

```bash
# macOS / Linux
claude mcp add --scope user gm-coach -- node "$HOME/.codex/plugins/gm-coach/mcp_server.mjs"
```

**Claude Desktop** (Windows and macOS): add GM Coach to `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`), using the full path to `mcp_server.mjs`, then restart Claude:

```json
{
  "mcpServers": {
    "gm-coach": { "command": "node", "args": ["/full/path/to/.codex/plugins/gm-coach/mcp_server.mjs"] }
  }
}
```

Then open a new chat and write: *"GM Coach, help me connect my Speediance account."* To update, replace the plugin folder with the new version and restart the app. Your account and training profile stay in place.
