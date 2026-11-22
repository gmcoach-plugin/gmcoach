#!/usr/bin/env bash
# GM Coach - instalator dla macOS (Codex + opcjonalny tunel ChatGPT).
# Uzycie:
#   bash install-macos.sh                         # plugin + pytanie o tunel
#   bash install-macos.sh --tunnel --tunnel-id tunnel_xxx
#   bash install-macos.sh --no-tunnel
#   bash install-macos.sh --uninstall [--remove-data]
#   bash install-macos.sh --no-tunnel --language en   # jezyk komunikatow: pl|en
# Klucz tunelu: ukryty monit albo zmienna GM_COACH_TUNNEL_KEY (nigdy jako argument).
set -euo pipefail

EXPECTED_OS='macos'
TUNNEL_CLIENT_VERSION='0.0.19'
sha_for() {
  case "$1" in
    darwin-amd64) echo 'dff97674c77cac59e6ab3d901e6cff50fb17a5784c01d8959d1f4adb3afdf4bf' ;;
    darwin-arm64) echo '2243d024b77af8ee4b4ab7a1447949e5fc8d82bcd2d51b178927f2da9e47ecfd' ;;
    linux-amd64)  echo '9ee9448592345a9dd1517fb79791ab54d24f051142eb92bcbe8cd355effc9142' ;;
    linux-arm64)  echo '5a19e556c4a8736ab7a6fde6f0568f6e7411fa2dff21186fc15bc30e9b98a603' ;;
    *) return 1 ;;
  esac
}

want_tunnel=''; tunnel_id=''; client_zip=''; no_start=0; uninstall=0; remove_data=0; skip_plugin=0; lang=''
# Komunikat w wybranym jezyku / message in the selected language: t 'polski' 'English'
t() { if [[ "$lang" == en ]]; then printf '%s' "$2"; else printf '%s' "$1"; fi; }
while (( $# )); do
  case "$1" in
    --language|--lang)
      case "${2:-}" in
        pl|PL) lang=pl ;;
        en|EN) lang=en ;;
        *) echo "Nieznany jezyk / Unknown language: ${2:-} (pl|en)" >&2; exit 2 ;;
      esac
      shift ;;
    --tunnel) want_tunnel=1 ;;
    --no-tunnel) want_tunnel=0 ;;
    --tunnel-id) tunnel_id="${2:-}"; shift ;;
    --tunnel-client-zip) client_zip="${2:-}"; shift ;;
    --no-start) no_start=1 ;;
    --skip-plugin) skip_plugin=1 ;;
    --uninstall) uninstall=1 ;;
    --remove-data) remove_data=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Nieznana opcja / Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
if [[ -z "$lang" ]]; then
  lang=pl
  if [[ -t 0 && -z "${GM_COACH_NONINTERACTIVE:-}" ]]; then
    lang_ans=''
    read -r -p 'Jezyk / Language: [1] Polski  [2] English ' lang_ans || true
    case "$lang_ans" in 2|en|EN|eng|english|English) lang=en ;; esac
  fi
fi

case "$(uname -s)" in
  Darwin) os=macos; tc_os=darwin ;;
  Linux) os=linux; tc_os=linux ;;
  *) echo "$(t 'Nieobslugiwany system.' 'Unsupported operating system.')" >&2; exit 1 ;;
esac
if [[ "$os" != "$EXPECTED_OS" ]]; then
  echo "$(t "Ten skrypt jest dla $EXPECTED_OS; uzyj install-$os.sh." "This script is for $EXPECTED_OS; use install-$os.sh.")" >&2; exit 1
fi
case "$(uname -m)" in
  x86_64|amd64) tc_arch=amd64 ;;
  arm64|aarch64) tc_arch=arm64 ;;
  *) echo "$(t 'Nieobslugiwana architektura:' 'Unsupported architecture:') $(uname -m)" >&2; exit 1 ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_root="$script_dir/plugin"
home_dir="${HOME:?Brak HOME / HOME is not set}"
codex_home="${CODEX_HOME:-$home_dir/.codex}"
plugin_dir="$codex_home/plugins/gm-coach"
marketplace_path="$home_dir/.agents/plugins/marketplace.json"
if [[ "$os" == macos ]]; then
  state_dir="${GM_COACH_STATE_DIR:-$home_dir/Library/Application Support/GMCoachTunnel}"
  agent_label='com.gmcoach.chatgpt-tunnel'
  agent_plist="$home_dir/Library/LaunchAgents/$agent_label.plist"
else
  state_dir="${GM_COACH_STATE_DIR:-${XDG_DATA_HOME:-$home_dir/.local/share}/gm-coach-tunnel}"
  unit_name='gm-coach-tunnel.service'
  unit_path="${XDG_CONFIG_HOME:-$home_dir/.config}/systemd/user/$unit_name"
fi
secret_service='gm-coach-tunnel'
secret_account='tunnel-runtime-key'

step() { printf '==> %s\n' "$*"; }

run_codex() {
  command -v codex >/dev/null 2>&1 || return 1
  CODEX_HOME="$codex_home" codex "$@" >/dev/null 2>&1
}

stop_service() {
  if [[ "$os" == macos ]]; then
    if [[ -f "$agent_plist" ]]; then
      launchctl bootout "gui/$(id -u)" "$agent_plist" >/dev/null 2>&1 || launchctl unload "$agent_plist" >/dev/null 2>&1 || true
    fi
  else
    if command -v systemctl >/dev/null 2>&1; then
      systemctl --user disable --now "$unit_name" >/dev/null 2>&1 || true
    fi
  fi
}

secret_store() { # klucz na stdin
  local key; IFS= read -r key
  if [[ "$os" == macos ]]; then
    security delete-generic-password -s "$secret_service" -a "$secret_account" >/dev/null 2>&1 || true
    # 'security -i' czyta polecenie ze stdin, wiec klucz nie trafia do listy procesow.
    printf 'add-generic-password -U -s %s -a %s -w "%s"\n' "$secret_service" "$secret_account" "$key" | security -i >/dev/null
    echo keychain
  elif command -v secret-tool >/dev/null 2>&1 && printf '%s' "$key" | secret-tool store --label='GM Coach tunnel key' service "$secret_service" account "$secret_account" 2>/dev/null; then
    rm -f -- "$state_dir/tunnel-key"
    echo libsecret
  else
    ( umask 077; printf '%s' "$key" > "$state_dir/tunnel-key" )
    chmod 600 "$state_dir/tunnel-key"
    echo file
  fi
}

secret_delete() {
  if [[ "$os" == macos ]]; then
    security delete-generic-password -s "$secret_service" -a "$secret_account" >/dev/null 2>&1 || true
  elif command -v secret-tool >/dev/null 2>&1; then
    secret-tool clear service "$secret_service" account "$secret_account" >/dev/null 2>&1 || true
  fi
}

# ---------------------------------------------------------------- odinstalowanie
if (( uninstall )); then
  step "$(t 'Odinstalowywanie GM Coach' 'Uninstalling GM Coach')"
  stop_service
  if [[ "$os" == macos ]]; then rm -f -- "$agent_plist"; else
    rm -f -- "$unit_path"; command -v systemctl >/dev/null 2>&1 && systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi
  secret_delete
  rm -rf -- "$state_dir"
  run_codex mcp remove gm_coach_local || true
  run_codex plugin remove gm-coach@personal || true
  rm -rf -- "$plugin_dir" "$codex_home/plugins/cache/personal/gm-coach"
  find "$codex_home/plugins" -maxdepth 1 -type d \( -name '.gm-coach-backup-*' -o -name '.gm-coach-staging-*' \) -exec rm -rf -- {} + 2>/dev/null || true
  if [[ -f "$marketplace_path" ]] && command -v node >/dev/null 2>&1; then
    GM_MP="$marketplace_path" node -e 'const fs=require("fs");const p=process.env.GM_MP;const m=JSON.parse(fs.readFileSync(p,"utf8"));m.plugins=(m.plugins||[]).filter(x=>x.name!=="gm-coach");fs.writeFileSync(p,JSON.stringify(m,null,2)+"\n")' && echo "$(t 'Usunieto wpis gm-coach z marketplace Personal.' 'Removed the gm-coach entry from the Personal marketplace.')"
  elif [[ -f "$marketplace_path" ]]; then
    echo "$(t "Usun recznie wpis \"gm-coach\" z $marketplace_path (brak node)." "Remove the \"gm-coach\" entry from $marketplace_path manually (node not found).")"
  fi
  data_dir="$codex_home/plugins/data/gm-coach"
  if (( remove_data )); then
    rm -rf -- "$data_dir"; echo "$(t 'Usunieto lokalne dane GM Coach. Haslo Speediance usun z pekow kluczy systemu (wpisy GM Coach / Speediance), jesli istnieja.' 'Removed local GM Coach data. Remove the Speediance password from the system keyring (GM Coach / Speediance entries), if present.')"
  elif [[ -d "$data_dir" ]]; then
    echo "$(t "Dane konta zostawiono w $data_dir (uzyj --remove-data, aby je usunac)." "Account data was kept in $data_dir (use --remove-data to delete it).")"
  fi
  echo "$(t 'GM Coach odinstalowany. Zrestartuj Codex.' 'GM Coach uninstalled. Restart Codex.')"
  exit 0
fi

# ---------------------------------------------------------------- plugin
if (( ! skip_plugin )); then
  inner="$package_root/scripts/install-codex-desktop.sh"
  [[ -f "$inner" ]] || { echo "$(t 'Brak folderu "plugin" obok instalatora. Rozpakuj cale archiwum ZIP.' 'The "plugin" folder is missing next to the installer. Extract the whole ZIP archive.')" >&2; exit 1; }
  step "$(t "Instalacja pluginu GM Coach dla Codex ($codex_home)" "Installing GM Coach plugin for Codex ($codex_home)")"
  if [[ -d "$plugin_dir" ]]; then echo "$(t 'Znaleziono poprzednia instalacje - aktualizacja.' 'Found a previous installation - updating.')"; bash "$inner" --update; else bash "$inner"; fi
fi

# ---------------------------------------------------------------- tunel (opcjonalny)
if [[ -z "$want_tunnel" && -f "$state_dir/tunnel.env" ]]; then
  echo "$(t "Tunel ChatGPT jest juz skonfigurowany i zostaje bez zmian. Zmienisz go: bash install-$os.sh --skip-plugin --tunnel" "The ChatGPT tunnel is already configured and stays unchanged. To change it: bash install-$os.sh --skip-plugin --tunnel")"
  exit 0
fi
if [[ -z "$want_tunnel" ]]; then
  want_tunnel=0
  if [[ -t 0 && -z "${GM_COACH_NONINTERACTIVE:-}" ]]; then
    ans=''
    read -r -p "$(t 'Czy uzywac GM Coach takze w ChatGPT? Potrzebne beda ID tunelu i klucz z platform.openai.com. Enter = nie [t/N] ' 'Use GM Coach in ChatGPT too? You will need a tunnel ID and key from platform.openai.com. Enter = no [y/N] ')" ans || true
    [[ "$ans" =~ ^([tTyY]|tak|yes)$ ]] && want_tunnel=1
  fi
fi
if (( ! want_tunnel )); then
  echo "$(t "Pominieto tunel ChatGPT. Dodasz go pozniej: bash install-$os.sh --skip-plugin --tunnel" "Skipped the ChatGPT tunnel. You can add it later: bash install-$os.sh --skip-plugin --tunnel")"
  exit 0
fi

step "$(t 'Konfiguracja tunelu ChatGPT' 'Configuring the ChatGPT tunnel')"
node_bin="$plugin_dir/runtime/bin/node"
[[ -x "$node_bin" ]] || node_bin="$plugin_dir/runtime/node"
[[ -f "$plugin_dir/mcp_server.mjs" && -x "$node_bin" ]] || { echo "$(t 'Plugin GM Coach nie jest zainstalowany (brak mcp_server.mjs lub node).' 'The GM Coach plugin is not installed (mcp_server.mjs or node missing).')" >&2; exit 1; }
if [[ -z "$tunnel_id" ]]; then read -r -p "$(t 'Wklej ID tunelu (tunnel_...): ' 'Paste the tunnel ID (tunnel_...): ')" tunnel_id; fi
[[ "$tunnel_id" =~ ^tunnel_[A-Za-z0-9]+$ ]] || { echo "$(t 'Niepoprawne ID tunelu.' 'Invalid tunnel ID.')" >&2; exit 1; }

command -v unzip >/dev/null 2>&1 || { echo "$(t 'Wymagany jest unzip.' 'unzip is required.')" >&2; exit 1; }
if command -v sha256sum >/dev/null 2>&1; then sha_cmd=(sha256sum); else sha_cmd=(shasum -a 256); fi
mkdir -p "$state_dir"; chmod 700 "$state_dir"
zip_name="tunnel-client-v$TUNNEL_CLIENT_VERSION-$tc_os-$tc_arch.zip"
expected="$(sha_for "$tc_os-$tc_arch")"
tmp="$(mktemp -d)"; trap 'rm -rf -- "$tmp"' EXIT
if [[ -n "$client_zip" ]]; then cp -- "$client_zip" "$tmp/$zip_name"; else
  echo "$(t "Pobieranie $zip_name ..." "Downloading $zip_name ...")"
  curl -fsSL --proto '=https' -o "$tmp/$zip_name" "https://github.com/openai/tunnel-client/releases/download/v$TUNNEL_CLIENT_VERSION/$zip_name"
fi
actual="$("${sha_cmd[@]}" "$tmp/$zip_name" | awk '{print $1}')"
[[ "$actual" == "$expected" ]] || { echo "$(t 'Weryfikacja SHA-256 tunnel-client nie powiodla sie.' 'tunnel-client SHA-256 verification failed.')" >&2; exit 1; }
echo 'SHA-256 tunnel-client: OK'
stop_service
rm -rf -- "$state_dir/tunnel-client"
unzip -q "$tmp/$zip_name" -d "$state_dir/tunnel-client"
client="$(find "$state_dir/tunnel-client" -type f -name tunnel-client | head -n 1)"
[[ -n "$client" ]] || { echo "$(t 'Archiwum nie zawiera tunnel-client.' 'The archive does not contain tunnel-client.')" >&2; exit 1; }
chmod +x "$client" "$(dirname "$client")"/cloudflared 2>/dev/null || true
if [[ "$os" == macos ]]; then xattr -dr com.apple.quarantine "$state_dir/tunnel-client" 2>/dev/null || true; fi

if [[ -n "${GM_COACH_TUNNEL_KEY:-}" ]]; then key="$GM_COACH_TUNNEL_KEY"; unset GM_COACH_TUNNEL_KEY
else read -r -s -p "$(t 'Wklej klucz tunelu (nie bedzie widoczny): ' 'Paste the tunnel key (it will not be shown): ')" key; echo; fi
(( ${#key} >= 8 )) || { echo "$(t 'Klucz jest pusty lub za krotki.' 'The key is empty or too short.')" >&2; exit 1; }
[[ "$key" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "$(t 'Klucz zawiera niedozwolone znaki.' 'The key contains invalid characters.')" >&2; exit 1; }
store_kind="$(printf '%s\n' "$key" | secret_store)"
unset key
echo "$(t 'Klucz zapisany:' 'Key stored:') $store_kind"

# Preserve the same account directory selected by the core installer.
data_dir="$(GM_COACH_CODEX_HOME="$codex_home" "$node_bin" - <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const pluginDir = process.env.GM_COACH_PLUGIN_DIR;
const homeDir = process.env.GM_COACH_HOME_DIR;
const installPath = process.env.GM_COACH_INSTALL_PATH;
const codexHome = process.env.GM_COACH_CODEX_HOME;
const dataRoot = path.join(codexHome, 'plugins', 'data');
const legacyRoot = path.join(dataRoot, 'agent-plugins');
const matches = [];
for (const directory of [path.join(codexHome, 'plugins'), dataRoot, legacyRoot]) {
  if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) {
    throw new Error('GM Coach data path contains a symbolic link; refusing to redirect local account data.');
  }
}
if (fs.existsSync(legacyRoot)) {
  for (const entry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(legacyRoot, entry.name);
    if (fs.lstatSync(candidate).isSymbolicLink()) throw new Error('GM Coach legacy data contains a symbolic link; refusing to redirect local account data.');
    const accounts = path.join(candidate, 'accounts');
    if (!fs.existsSync(accounts) || !fs.statSync(accounts).isDirectory()) continue;
    const profiles = fs.readdirSync(accounts, { withFileTypes: true });
    const hasCoachData = profiles.some(profile => {
      if (!profile.isDirectory()) return false;
      const profilePath = path.join(accounts, profile.name);
      return ['speediance-config.json', 'training-profile.json']
        .some(name => fs.existsSync(path.join(profilePath, name)));
    });
    if (hasCoachData) matches.push(candidate);
  }
}
if (matches.length > 1) throw new Error('Found more than one existing GM Coach data directory. Update stopped to protect account data.');
const dataPath = matches[0] || path.join(dataRoot, 'gm-coach');
fs.mkdirSync(dataPath, { recursive: true });
const homeReal = fs.realpathSync(codexHome);
const dataReal = fs.realpathSync(dataPath);
if (dataReal !== homeReal && !dataReal.startsWith(homeReal + path.sep)) {
  throw new Error('GM Coach data directory resolves outside CODEX_HOME.');
}
for (let current = dataPath; current !== codexHome && current !== path.dirname(current); current = path.dirname(current)) {
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
    throw new Error('GM Coach data path contains a symbolic link; refusing to redirect local account data.');
  }
}
process.stdout.write(dataPath);
NODE
)"

cfg="$state_dir/tunnel.env"
{
  printf 'GM_TUNNEL_ID=%q\n' "$tunnel_id"
  printf 'GM_PLUGIN_DIR=%q\n' "$plugin_dir"
  printf 'GM_DATA_DIR=%q\n' "$data_dir"
  printf 'GM_CLIENT=%q\n' "$client"
  printf 'GM_NODE_DIR=%q\n' "$(dirname "$node_bin")"
  printf 'GM_STORE=%q\n' "$store_kind"
} > "$cfg"
chmod 600 "$cfg"

runner="$state_dir/run-tunnel.sh"
cat > "$runner" <<'RUNNER'
#!/usr/bin/env bash
# GM Coach - petla tunelu ChatGPT (uruchamiana w tle).
set -u
state_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$state_dir/tunnel.env"
read_key() {
  case "$GM_STORE" in
    keychain) security find-generic-password -s gm-coach-tunnel -a tunnel-runtime-key -w 2>/dev/null ;;
    libsecret) secret-tool lookup service gm-coach-tunnel account tunnel-runtime-key 2>/dev/null ;;
    *) cat "$state_dir/tunnel-key" 2>/dev/null ;;
  esac
}
delay=15
while true; do
  started=$(date +%s)
  key="$(read_key || true)"
  if [[ -n "$key" ]]; then
    ( cd "$GM_PLUGIN_DIR" && \
      CONTROL_PLANE_API_KEY="$key" CONTROL_PLANE_TUNNEL_ID="$GM_TUNNEL_ID" PLUGIN_DATA="$GM_DATA_DIR" \
      SPEEDIANCE_CLI="$GM_PLUGIN_DIR/bin/speediance-cli" PATH="$GM_NODE_DIR:$PATH" \
      "$GM_CLIENT" run --mcp.command 'node ./mcp_server.mjs' --health.listen-addr 127.0.0.1:0 \
        --health.url-file "$state_dir/health-url.txt" --log.level=warn ) || true
  fi
  unset key
  if (( $(date +%s) - started >= 60 )); then delay=15; fi
  sleep "$delay"
  delay=$(( delay * 2 > 120 ? 120 : delay * 2 ))
done
RUNNER
chmod 700 "$runner"

if [[ "$os" == macos ]]; then
  mkdir -p "$(dirname "$agent_plist")"
  cat > "$agent_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$agent_label</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$runner</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>/dev/null</string>
</dict></plist>
PLIST
  if (( ! no_start )); then
    launchctl bootstrap "gui/$(id -u)" "$agent_plist" 2>/dev/null || launchctl load -w "$agent_plist"
    echo "$(t "Uruchomiono LaunchAgent $agent_label (start przy logowaniu)." "Started LaunchAgent $agent_label (starts at login).")"
  else echo "$(t "Zapisano LaunchAgent $agent_plist (nie uruchomiono)." "Saved LaunchAgent $agent_plist (not started).")"; fi
else
  mkdir -p "$(dirname "$unit_path")"
  cat > "$unit_path" <<UNIT
[Unit]
Description=GM Coach ChatGPT tunnel
After=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash "$runner"
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
UNIT
  if (( ! no_start )) && command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload
    systemctl --user enable --now "$unit_name"
    echo "$(t "Uruchomiono usluge systemd --user $unit_name." "Started systemd --user service $unit_name.")"
    echo "$(t "Aby dzialala bez zalogowania: loginctl enable-linger \"$USER\" (opcjonalnie)." "To keep it running while logged out: loginctl enable-linger \"$USER\" (optional).")"
  else echo "$(t "Zapisano $unit_path (nie uruchomiono)." "Saved $unit_path (not started).")"; fi
fi
echo "$(t 'Kontrola:' 'Check:') \"$client\" health --url-file \"$state_dir/health-url.txt\" --require-control-plane-poll"

