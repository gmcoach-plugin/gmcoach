# GM Coach - update for Claude

This package is for people who **already have** the GM Coach plugin in Claude Code (the Code tab in the Claude app, or the `claude` CLI).
It replaces only the plugin files in `~/.claude/gm-coach`. Kept: Node.js, speediance-cli, the credential-store runtime (node_modules),
the `.mcp.json` file, your data and profile, and the Speediance password. **Nothing is downloaded and no new sign-in is needed.**

Only have the `.mcpb` extension in Claude Desktop (no Claude Code)? The updater does not cover it - install the new `.mcpb` file from the installer package (Settings > Extensions).

## Windows

1. Extract the whole ZIP archive (right-click, Extract All).
2. Close the Claude app (recommended).
3. Run `UPDATE-CLAUDE-WINDOWS.cmd` and choose a language.
4. Open a new Claude Code session or a new chat.

## macOS

`bash update-claude-macos-linux.sh` (or double-click `UPDATE-CLAUDE-MACOS.command`; if macOS blocks it: right-click, Open).

## Linux

`bash update-claude-macos-linux.sh`

## What the updater does

1. Checks the installed version (same or newer: nothing changes; `-Force` / `--force` overrides).
2. Checks that all components are present. If something is missing, or the new version needs different components, it exits with code 4 and asks you to use the full installer.
3. Makes a backup (`~/.claude/gm-coach/backup-*`, the last two are kept), replaces the files, updates the version in the marketplace.
4. Starts the new server and checks `initialize` and `tools/list`. If that fails, it **restores the previous version**.
5. Runs `claude plugin marketplace update` and `claude plugin update`. Without the CLI, update the plugin in the Claude plugins panel.

Check without changing anything: `-CheckOnly` / `--check-only`.

## Exit codes

0 - done; 1 - error, previous version restored; 2 - nothing to do; 3 - files updated but `claude plugin update` was not run
(update the plugin in the Claude panel); 4 - the full installer is needed.
