# GM Coach - update for Codex

This package is for people who **already have** GM Coach in Codex. It replaces only the plugin files.
These stay in place and are not downloaded again: the private Node.js, speediance-cli, the credential-store
runtime (node_modules), your data and profile, the Speediance password in the system store, and your ChatGPT tunnel settings.
**No new sign-in is needed.** Do not have GM Coach yet? Use the installer package instead.

## Windows

1. Extract the whole ZIP archive (right-click, Extract All).
2. Close Codex (recommended).
3. Run `UPDATE-WINDOWS.cmd` and choose a language.
4. Open Codex and start a new chat.

## macOS

1. Extract the archive and close Codex.
2. In Terminal: `bash update-macos-linux.sh` (or double-click `UPDATE-MACOS.command`; if macOS blocks it: right-click, Open).
3. Open Codex and start a new chat.

## Linux

`bash update-macos-linux.sh`

## What the updater does

1. Checks the installed version. Same or newer version: nothing changes (`-Force` / `--force` overrides).
2. Makes a backup of the previous version (next to the plugin, a `.gm-coach-backup-*` folder).
3. Replaces the plugin files; the existing Node, CLI and keyring are reused. Only missing parts are downloaded (SHA-256 verified).
4. Starts the new server and checks `initialize` and `tools/list`. If that fails, it **restores the previous version**.
5. The ChatGPT tunnel is paused briefly and restarted; its settings are not changed.

Check without changing anything: `update-windows.ps1 -CheckOnly` or `bash update-macos-linux.sh --check-only`.

## Exit codes

0 - done; 1 - error, previous version restored; 2 - nothing to do (same/newer version, or not installed);
3 - files updated, but the Codex CLI did not confirm activation (restart Codex; if tools are missing, use the full installer).

## If something goes wrong

The previous version is in `.gm-coach-backup-*` inside `.codex/plugins`. Account data is never touched.
You can also run the full installer - it keeps your data and settings.
