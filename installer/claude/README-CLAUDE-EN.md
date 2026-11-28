# GM Coach for Claude — installation

Polski: `README-CLAUDE.md`

## Requirements

- Windows 10/11 and the **Claude** app, with you signed in.
- The **Code** tab opened in Claude at least once. This installs Claude Code, which the installer uses.

The Windows version includes everything it needs and installs without internet access.

## Install

1. Right-click the ZIP file, choose **Extract All…**, and open the extracted folder.
2. Double-click `START-CLAUDE-WINDOWS.cmd` and choose the language.
3. Open a new chat in Claude.

GM Coach appears in the plugin panel as **"Gm coach — Installed locally"**. It works in chats and in the Code tab.

## First use

- **If GM Coach already works on this computer in Codex,** Claude uses the same account. Write: **"GM Coach, check my account connection"**.
- **Otherwise,** write: **"GM Coach, help me connect my Speediance account"**. Open the link it gives you, choose the form language, then enter your e-mail, password and region. Finally, go back to the chat and write **"done"**.

The password goes to Windows Credential Manager. Do not share it in the chat.

## Update

Extract the new version and run `START-CLAUDE-WINDOWS.cmd` again. Claude can stay open. Then open a new chat. Your account and training profile stay unchanged.

## Other cases

**No Code tab in Claude.** Install GM Coach as an extension:

1. In the extracted folder, run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1 -BezCode`
2. In Claude, choose **Settings → Extensions → Advanced settings → Install Extension…** and select the `.mcpb` file shown by the installer.
3. In a new chat, enable GM Coach in the tools menu.

If you have the Code tab, do not install the `.mcpb` file. That would start a second, duplicate server.

**macOS and Linux.** You need Claude Code (the `claude` command) and internet access. In Terminal, in the extracted folder:

```bash
bash install-claude-macos.sh --language en   # macOS
bash install-claude-linux.sh --language en   # Linux
```

## Problems

| Problem | What to do |
|---|---|
| Installer file or `marketplace` folder missing | Extract the whole ZIP archive. |
| "Claude Code not found" | Open the **Code** tab in Claude once and try again, or use the method without the Code tab. |
| GM Coach does not work in the chat | Open a new chat and check that **"Gm coach"** is in the plugin panel under *Active*. |
| Old version after update | Quit and reopen Claude, then open a new chat. |
| Password save error | Check Windows Credential Manager. |

## Uninstall

In the extracted folder, run: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-claude-windows.ps1 -Uninstall`

If you installed the `.mcpb` extension, remove it in **Settings → Extensions**. Account data stays on the computer because Codex uses it too.

## Updating without a reinstall

Already have the plugin in Claude Code? Download the small `GM-Coach-<version>-claude-updater.zip` and run `UPDATE-CLAUDE-WINDOWS.cmd` (macOS/Linux: `bash update-claude-macos-linux.sh`). Nothing is downloaded, your data and password stay, with a backup and rollback. Details: README-CLAUDE-UPDATE-EN.md in the package.
