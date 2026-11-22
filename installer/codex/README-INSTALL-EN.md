# GM Coach for Codex — installation

Polski: `README-INSTALACJA.md`

## 1. Requirements

- Codex installed on Windows, macOS or Linux. You must be signed in.
- The `codex` command in the terminal. It lets the installer enable the plugin automatically. Without it, see step 7.
- Internet access. The installer downloads Node.js, the Speediance CLI and the required modules, then verifies their checksums.

## 2. Extract

Right-click the ZIP file, choose **Extract All…**, and work in the extracted folder.

## 3. Install

**Windows:** double-click `START-WINDOWS.cmd` and choose the language.

**macOS / Linux:** in Terminal, in the extracted folder:

```bash
bash install-macos.sh --language en   # macOS
bash install-linux.sh --language en   # Linux
```

On Windows you can also use PowerShell: `powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Language en`

At the end, the installer asks whether you also want to use GM Coach in ChatGPT. If you use only Codex, press **Enter**. Step 5 describes the tunnel.

Then quit Codex and start it again.

## 4. First use

1. In a new Codex chat, select **GM Coach**.
2. Check that the new version is running: **"GM Coach, show the local version diagnostics"**. The versions in the result should match, and `restartRequired` should be `false`.
3. Connect your account: **"GM Coach, help me connect my Speediance account"**. Open the link GM Coach gives you and enter your e-mail, password and region. Do not share the password in the chat.

The password is stored in the system password store: Windows Credential Manager, macOS Keychain or Linux Secret Service.

## 5. ChatGPT tunnel (optional)

Skip this step if you use GM Coach only in Codex. The tunnel makes GM Coach on your computer available in ChatGPT. The computer must be switched on and connected to the internet while you use it.

1. On [platform.openai.com](https://platform.openai.com), create a tunnel and copy its ID (`tunnel_...`).
2. Create a key with the **Tunnels: Read + Use** permission.
3. During the installation in step 3, answer **y** to the ChatGPT question. Paste the tunnel ID, then the key. The key is not shown while you paste it.
4. Open [chatgpt.com](https://chatgpt.com) in your web browser. In settings, add your own MCP server, choose the **Tunnel** connection and paste the tunnel ID. Your workspace administrator must allow custom MCP servers.

   Do this step **only in the web browser at chatgpt.com**. The "Connect to a custom MCP" window in the Codex app has no Tunnel option and is not used for this.

The installer stores the key in the system's secure store and starts the tunnel automatically when you sign in. At the end, it shows a `tunnel-client health ...` command that checks the tunnel.

If GM Coach is already installed, you can add or change the tunnel later:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -SkipPlugin -Tunnel
```

```bash
bash install-macos.sh --skip-plugin --tunnel   # macOS
bash install-linux.sh --skip-plugin --tunnel   # Linux
```

Details: [OpenAI documentation](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

## 6. Update

Quit Codex, extract the new version and run the installation as in step 3. Your account, training profile and configured tunnel stay unchanged. If the tunnel is already configured, the installer does not ask about it again. Then start Codex and check the diagnostics in a new chat.

## 7. Problems

| Problem | What to do |
|---|---|
| `plugin` folder missing | Extract the whole archive. |
| "codex not found" or GM Coach is not listed | In Codex, open the plugin list, choose **Personal**, then **GM Coach**, and enable it. |
| "Access is denied" during update | Quit Codex and run the installation again. |
| Diagnostics show the old version | Quit and reopen Codex, then open a new chat. |
| GM Coach does not work in ChatGPT | Check that the computer is on and run the `health` command from step 5. |
| Password save error | Check that the system password store works. |

## 8. Uninstall

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\install-windows.ps1 -Uninstall
```

```bash
bash install-macos.sh --uninstall   # macOS
bash install-linux.sh --uninstall   # Linux
```

Uninstalling removes the plugin and the tunnel. Account data stays on the computer. To remove it as well, add `-RemoveData` on Windows or `--remove-data` on macOS/Linux. Revoke the tunnel key separately on platform.openai.com.
