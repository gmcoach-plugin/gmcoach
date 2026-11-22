#!/usr/bin/env bash
# GM Coach - instalator dla Claude Code (macOS i Linux) / installer for Claude Code (macOS and Linux).
# Uzycie / Usage:
#   bash install-claude-unix.sh                    # instalacja albo aktualizacja / install or update
#   bash install-claude-unix.sh --language en      # jezyk komunikatow / message language: pl|en
#   bash install-claude-unix.sh --refresh-dependencies   # pobierz Node/CLI ponownie / re-download Node/CLI
#   bash install-claude-unix.sh --uninstall
# Wymaga / Requires: bash, curl, tar (z xz / with xz), shasum lub/or sha256sum, Claude Code CLI `claude`.
# Dane konta Speediance (profil, sesja, haslo w Keychain / Secret Service) nie sa ruszane ani usuwane.
# Speediance account data (profile, session, password in Keychain / Secret Service) is never touched.
# Bez sudo / no sudo. Zgodny z bash 3.2 / bash 3.2 compatible.
set -euo pipefail

lang=''; uninstall=0; refresh=0; expected_os="${GM_COACH_EXPECTED_OS:-}"
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
    --uninstall) uninstall=1 ;;
    --refresh-dependencies) refresh=1 ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Nieznana opcja / Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
if [[ -z "$lang" ]]; then
  lang=pl
  if [[ -t 0 && -z "${GM_COACH_NONINTERACTIVE:-}" ]]; then
    lang_ans=''
    read -r -p 'Jezyk / Language: [1] Polski  [2] English  (Enter = Polski) ' lang_ans || true
    case "$lang_ans" in 2|en|EN|eng|english|English|e) lang=en ;; esac
  fi
fi

step() { printf '==> %s\n' "$1"; }
die() { printf '%s\n' "$1" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=macos; release_os=Darwin; node_os=darwin ;;
  Linux) os=linux; release_os=Linux; node_os=linux ;;
  *) die "$(t 'Nieobslugiwany system. Na Windows uzyj START-CLAUDE-WINDOWS.cmd.' 'Unsupported operating system. On Windows use START-CLAUDE-WINDOWS.cmd.')" ;;
esac
if [[ -n "$expected_os" && "$expected_os" != "$os" ]]; then
  die "$(t "Ten skrypt jest dla $expected_os; uzyj install-claude-$os.sh." "This script is for $expected_os; use install-claude-$os.sh.")"
fi
case "$(uname -m)" in
  x86_64|amd64) release_arch=x86_64; node_arch=x64 ;;
  arm64|aarch64) release_arch=arm64; node_arch=arm64 ;;
  *) die "$(t 'Nieobslugiwana architektura (wymagane x64 lub ARM64):' 'Unsupported architecture (x64 or ARM64 required):') $(uname -m)" ;;
esac

market_name='gm-coach-local'
plugin_id="gm-coach@$market_name"
home_dir="${HOME:?Brak HOME / HOME is not set}"
install_root="$home_dir/.claude/gm-coach"
market_target="$install_root/marketplace"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_market="$script_dir/marketplace-unix"

find_claude() {
  if command -v claude >/dev/null 2>&1; then command -v claude; return 0; fi
  local c
  for c in "$home_dir/.local/bin/claude" "$home_dir/.claude/local/claude"; do
    if [[ -x "$c" ]]; then printf '%s' "$c"; return 0; fi
  done
  return 1
}

# ------------------------------------------------------------------ odinstalowanie / uninstall
if (( uninstall )); then
  step "$(t 'Odinstalowywanie GM Coach z Claude Code' 'Uninstalling GM Coach from Claude Code')"
  if cli="$(find_claude)"; then
    "$cli" plugin uninstall "$plugin_id" >/dev/null 2>&1 || true
    "$cli" plugin marketplace remove "$market_name" >/dev/null 2>&1 || true
  else
    echo "$(t 'Nie znaleziono CLI Claude Code; usun wtyczke w panelu wtyczek, jesli byla zainstalowana.' 'Claude Code CLI not found; remove the plugin in the plugins panel if it was installed.')" >&2
  fi
  if [[ -L "$install_root" ]]; then
    die "$(t "$install_root jest dowiazaniem symbolicznym; nie usuwam go automatycznie." "$install_root is a symbolic link; not removing it automatically.")"
  fi
  if [[ -d "$install_root" ]]; then
    rm -rf -- "$install_root"
    echo "$(t 'Usunieto' 'Removed') $install_root"
  fi
  echo "$(t 'Dane konta Speediance zostaly na komputerze (wspolne z Codex/ChatGPT).' 'Your Speediance account data stays on this computer (shared with Codex/ChatGPT).')"
  exit 0
fi

# ------------------------------------------------------------------ kontrole / checks
[[ -f "$package_market/.claude-plugin/marketplace.json" && -f "$package_market/gm-coach/mcp_server.mjs" ]] || \
  die "$(t 'Brak folderu "marketplace-unix" obok instalatora. Rozpakuj cale archiwum ZIP.' 'The "marketplace-unix" folder is missing next to the installer. Extract the whole ZIP archive.')"
cli="$(find_claude)" || die "$(t 'Nie znaleziono Claude Code CLI (`claude`). Zainstaluj Claude Code (https://claude.com/claude-code), potem uruchom instalator ponownie.' 'Claude Code CLI (`claude`) not found. Install Claude Code (https://claude.com/claude-code), then run the installer again.')"
echo "CLI: $cli"
for tool in curl tar awk; do
  command -v "$tool" >/dev/null 2>&1 || die "$(t "Wymagane narzedzie: $tool. Zainstaluj je i uruchom instalator ponownie." "Required tool: $tool. Install it and run the installer again.")"
done
if command -v sha256sum >/dev/null 2>&1; then
  sha256_file() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  die "$(t 'Wymagane sha256sum lub shasum do weryfikacji pobranych plikow.' 'sha256sum or shasum is required to verify downloads.')"
fi
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }
if [[ -L "$install_root" || -L "$market_target" ]]; then
  die "$(t 'Folder instalacji jest dowiazaniem symbolicznym. Przenies go i uruchom ponownie.' 'The install folder is a symbolic link. Move it aside and run again.')"
fi
version="$(awk -F'"' '/"version"/ { print $4; exit }' "$package_market/gm-coach/.claude-plugin/plugin.json")"
step "Claude Code: GM Coach $version ($os $node_arch)"

# ------------------------------------------------------------------ etap / staging
mkdir -p "$install_root"
staging=''; tmp_dir=''; backup=''
cleanup() {
  local s=$?
  trap - EXIT
  [[ -n "$tmp_dir" && -d "$tmp_dir" ]] && rm -rf -- "$tmp_dir"
  [[ -n "$staging" && -d "$staging" ]] && rm -rf -- "$staging"
  return "$s"
}
trap cleanup EXIT
staging="$(mktemp -d "$install_root/.staging.XXXXXX")"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/gm-coach-claude.XXXXXX")"
cp -R "$package_market/." "$staging/"
plugin_stage="$staging/gm-coach"
runtime_dir="$plugin_stage/runtime"
binary_dir="$plugin_stage/bin"
mkdir -p "$runtime_dir" "$binary_dir"
existing_plugin="$market_target/gm-coach"

runtime_target_matches() {
  local actual
  actual="$("$1" -p 'process.platform + "-" + process.arch' 2>/dev/null || true)"
  [[ "$actual" == "$node_os-$node_arch" ]]
}

# ------------------------------------------------------------------ Node.js 24
node_bin="$runtime_dir/bin/node"
node_reused=0
if (( refresh == 0 )) && [[ -x "$existing_plugin/runtime/bin/node" ]]; then
  old_ver="$("$existing_plugin/runtime/bin/node" --version 2>/dev/null || true)"
  if [[ "$old_ver" =~ ^v24\.[0-9]+\.[0-9]+$ ]] && runtime_target_matches "$existing_plugin/runtime/bin/node"; then
    cp -R "$existing_plugin/runtime/." "$runtime_dir/"
    node_reused=1
    echo "$(t 'Uzywam zainstalowanego Node.js' 'Reusing the installed Node.js') $old_ver"
  fi
fi
if (( node_reused == 0 )); then
  step "$(t 'Pobieranie prywatnego Node.js 24 LTS i weryfikacja SHA-256' 'Downloading a private Node.js 24 LTS runtime and verifying SHA-256')"
  node_checksums="$tmp_dir/node-SHASUMS256.txt"
  curl -fsSL 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -o "$node_checksums"
  node_archive="$(awk -v os="$node_os" -v arch="$node_arch" 'length($1)==64 { name=$2; sub(/^\*/, "", name); suffix="-" os "-" arch ".tar.xz"; if (index(name, "node-v24.")==1 && substr(name, length(name)-length(suffix)+1)==suffix) { print name; exit } }' "$node_checksums")"
  [[ -n "$node_archive" ]] || die "$(t "Brak Node.js 24 dla $node_os-$node_arch." "Node.js 24 has no $node_os-$node_arch download.")"
  node_expected="$(awk -v file="$node_archive" '{ name=$2; sub(/^\*/, "", name); if (name==file) { print $1; exit } }' "$node_checksums")"
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$tmp_dir/$node_archive"
  [[ "$(lower "$(sha256_file "$tmp_dir/$node_archive")")" == "$(lower "$node_expected")" ]] || \
    die "$(t 'Node.js nie przeszedl weryfikacji SHA-256.' 'Node.js download failed SHA-256 verification.')"
  tar -tJf "$tmp_dir/$node_archive" >/dev/null 2>&1 || \
    die "$(t 'Ten tar nie rozpakowuje archiwow .tar.xz. Zainstaluj obsluge xz i sprobuj ponownie.' 'This tar cannot extract .tar.xz archives. Install xz support and try again.')"
  tar -xJf "$tmp_dir/$node_archive" -C "$tmp_dir"
  cp -R "$tmp_dir/${node_archive%.tar.xz}/." "$runtime_dir/"
  chmod +x "$node_bin"
fi
runtime_target_matches "$node_bin" || die "$(t 'Runtime Node.js nie pasuje do systemu/architektury.' 'Node.js runtime does not match this OS/architecture.')"

# ------------------------------------------------------------------ speediance-cli
cli_bin="$binary_dir/speediance-cli"
if (( refresh == 0 && node_reused == 1 )) && [[ -x "$existing_plugin/bin/speediance-cli" ]]; then
  cp "$existing_plugin/bin/speediance-cli" "$cli_bin"
  chmod +x "$cli_bin"
  echo "$(t 'Uzywam zainstalowanego Speediance CLI.' 'Reusing the installed Speediance CLI.')"
fi
if [[ ! -x "$cli_bin" ]]; then
  step "$(t 'Pobieranie Speediance CLI i weryfikacja SHA-256' 'Downloading Speediance CLI and verifying SHA-256')"
  release_json="$tmp_dir/release.json"
  curl -fsSL -H 'Accept: application/vnd.github+json' -H 'User-Agent: GM-Coach-Installer' \
    'https://api.github.com/repos/stozo04/speediance-cli/releases/latest' -o "$release_json"
  archive_name="speediance-cli_${release_os}_${release_arch}.tar.gz"
  urls="$("$node_bin" - "$release_json" "$archive_name" <<'NODE'
const fs = require('node:fs');
const [releasePath, assetName] = process.argv.slice(2);
const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
const asset = release.assets.find(item => item.name === assetName);
const checksums = release.assets.find(item => item.name === 'checksums.txt');
if (!asset || !checksums) process.exit(3);
process.stdout.write(asset.browser_download_url + '\n' + checksums.browser_download_url + '\n');
NODE
  )" || die "$(t "Najnowsze wydanie Speediance CLI nie ma $archive_name lub checksums.txt." "The latest Speediance CLI release has no $archive_name or checksums.txt.")"
  archive_url="$(printf '%s\n' "$urls" | sed -n '1p')"
  checksums_url="$(printf '%s\n' "$urls" | sed -n '2p')"
  curl -fsSL "$archive_url" -o "$tmp_dir/$archive_name"
  curl -fsSL "$checksums_url" -o "$tmp_dir/cli-checksums.txt"
  cli_expected="$(awk -v file="$archive_name" '$2==file || $2=="*"file { print $1; exit }' "$tmp_dir/cli-checksums.txt")"
  [[ -n "$cli_expected" ]] || die "$(t "Brak sumy SHA-256 dla $archive_name." "No SHA-256 checksum published for $archive_name.")"
  [[ "$(lower "$(sha256_file "$tmp_dir/$archive_name")")" == "$(lower "$cli_expected")" ]] || \
    die "$(t 'Speediance CLI nie przeszedl weryfikacji SHA-256.' 'Speediance CLI download failed SHA-256 verification.')"
  mkdir -p "$tmp_dir/cli"
  tar -xzf "$tmp_dir/$archive_name" -C "$tmp_dir/cli"
  cli_file="$(find "$tmp_dir/cli" -type f -name speediance-cli -print | head -n 1)"
  [[ -n "$cli_file" ]] || die "$(t 'Zweryfikowane archiwum nie zawiera speediance-cli.' 'The verified archive does not contain speediance-cli.')"
  cp "$cli_file" "$cli_bin"
  chmod +x "$cli_bin"
fi

# ------------------------------------------------------------------ @napi-rs/keyring (przypieta wersja / pinned version)
step "$(t 'Instalacja magazynu hasel (@napi-rs/keyring, przypieta wersja + SHA)' 'Installing credential store runtime (@napi-rs/keyring, pinned version + SHA)')"
keyring_args=("$plugin_stage/scripts/install-keyring-runtime.mjs" --root "$plugin_stage" --platform "$node_os" --arch "$node_arch")
if [[ "$node_os" == linux ]]; then
  keyring_libc=gnu
  if (ldd --version 2>&1 || true) | grep -qi musl; then keyring_libc=musl; fi
  keyring_args+=(--libc "$keyring_libc")
fi
"$node_bin" "${keyring_args[@]}"

# ------------------------------------------------------------------ podmiana / swap
# Na Unix dzialajacy serwer MCP zachowuje otwarte pliki po zmianie nazwy katalogu,
# wiec stary katalog mozna bezpiecznie przeniesc i usunac. A running MCP server keeps
# its open files after the directory is renamed, so the old tree can be moved away.
if [[ -e "$market_target" ]]; then
  backup="$install_root/.previous.$$"
  rm -rf -- "$backup"
  mv "$market_target" "$backup"
fi
if ! mv "$staging" "$market_target"; then
  [[ -n "$backup" ]] && mv "$backup" "$market_target"
  die "$(t 'Nie udalo sie podmienic plikow wtyczki; przywrocono poprzednia wersje.' 'Could not replace the plugin files; the previous version was restored.')"
fi
staging=''
[[ -n "$backup" ]] && rm -rf -- "$backup"

# ------------------------------------------------------------------ Claude Code: marketplace + wtyczka / plugin
run_claude() {
  local out
  if ! out="$("$cli" "$@" 2>&1)"; then
    printf '%s\n%s\n' "$(t 'Polecenie nie powiodlo sie' 'Command failed'): claude $*" "$out" >&2
    exit 1
  fi
}
if "$cli" plugin marketplace list 2>/dev/null | grep -q "$market_name"; then
  run_claude plugin marketplace update "$market_name"
  if "$cli" plugin list 2>/dev/null | grep -q "$plugin_id"; then
    run_claude plugin update "$plugin_id"
    echo "$(t 'Zaktualizowano wtyczke.' 'Plugin updated.')"
  else
    run_claude plugin install "$plugin_id"
    echo "$(t 'Zainstalowano wtyczke.' 'Plugin installed.')"
  fi
else
  run_claude plugin marketplace add "$market_target"
  run_claude plugin install "$plugin_id"
  echo "$(t 'Dodano marketplace i zainstalowano wtyczke.' 'Marketplace added and plugin installed.')"
fi

echo "$(t 'Gotowe. GM Coach jest zainstalowany w Claude Code. Otworz nowa sesje Claude Code.' 'Done. GM Coach is installed in Claude Code. Open a new Claude Code session.')"
echo "$(t 'Pobrane w tym przebiegu komponenty przeszly weryfikacje SHA-256.' 'Components downloaded in this run passed SHA-256 verification.')"
echo ''
echo "$(t 'Pierwsze uzycie: napisz "GM Coach, sprawdz polaczenie z Speediance".' 'First use: write "GM Coach, check my Speediance connection".')"
if [[ "$os" == macos ]]; then
  echo "$(t 'Haslo Speediance jest przechowywane w Peku kluczy macOS (Keychain).' 'The Speediance password is stored in the macOS Keychain.')"
else
  echo "$(t 'Haslo Speediance jest przechowywane w Secret Service (np. GNOME Keyring / KWallet).' 'The Speediance password is stored in Secret Service (e.g. GNOME Keyring / KWallet).')"
fi
