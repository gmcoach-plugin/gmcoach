#!/usr/bin/env bash
# GM Coach - aktualizator dla Claude Code (macOS i Linux) / updater for Claude Code (macOS and Linux).
# Uzycie / Usage:
#   bash update-claude-macos-linux.sh                 # aktualizacja / update
#   bash update-claude-macos-linux.sh --language en   # jezyk komunikatow / message language: pl|en
#   bash update-claude-macos-linux.sh --check-only    # tylko sprawdz / only check
#   bash update-claude-macos-linux.sh --force         # podmien pliki nawet przy tej samej lub nowszej wersji
# Podmienia tylko pliki wtyczki w ~/.claude/gm-coach/marketplace/gm-coach. Zostaja: runtime Node, speediance-cli,
# node_modules (keyring), .mcp.json, dane i profil, haslo w Keychain / Secret Service. Nic nie jest pobierane.
# Replaces only the plugin files. Kept: Node runtime, speediance-cli, node_modules (keyring), .mcp.json, data and
# profile, the saved password. Nothing is downloaded. Backup + rollback on error.
# Kody wyjscia / exit codes: 0 OK, 1 blad (przywrocono) / error (restored), 2 nic do zrobienia / nothing to do,
# 3 pliki zaktualizowane, 'claude plugin update' nie zadzialalo / files updated, 'claude plugin update' did not run,
# 4 zmieniono wymagane skladniki - uzyj pelnego instalatora / required components changed - use the full installer.
# Zgodny z bash 3.2 (macOS) / bash 3.2 compatible. Bez sudo / no sudo.
set -euo pipefail

lang=''; force=0; check_only=0
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
    --force) force=1 ;;
    --check-only) check_only=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
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
step() { printf '==> %s\n' "$*"; }
# GM_COACH_TEST_UNAME: tylko do testow / for tests only
case "${GM_COACH_TEST_UNAME:-$(uname -s)}" in
  Darwin|Linux) ;;
  *) echo "$(t 'Nieobslugiwany system. Na Windows uzyj UPDATE-CLAUDE-WINDOWS.cmd.' 'Unsupported operating system. On Windows use UPDATE-CLAUDE-WINDOWS.cmd.')" >&2; exit 1 ;;
esac

market_name='gm-coach-local'
plugin_id="gm-coach@$market_name"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_plugin="$script_dir/gm-coach"
verify_script="$script_dir/verify-server.mjs"
home_dir="${HOME:?Brak HOME / HOME is not set}"
install_root="$home_dir/.claude/gm-coach"
market_dir="$install_root/marketplace"
plugin_dir="$market_dir/gm-coach"
market_json="$market_dir/.claude-plugin/marketplace.json"
node_bin="$plugin_dir/runtime/bin/node"
preserve='runtime bin node_modules .mcp.json'

is_preserved() { local n; for n in $preserve; do [[ "$n" == "$1" ]] && return 0; done; return 1; }
claude_version() { [[ -f "$1/.claude-plugin/plugin.json" ]] && awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$1/.claude-plugin/plugin.json" || true; }
semver_gt() {
  local a="$1" b="$2" i x y
  for i in 1 2 3; do
    x="$(printf '%s' "$a" | cut -d. -f$i)"; y="$(printf '%s' "$b" | cut -d. -f$i)"
    (( 10#$x > 10#$y )) && return 0
    (( 10#$x < 10#$y )) && return 1
  done
  return 1
}
find_claude() {
  if command -v claude >/dev/null 2>&1; then command -v claude; return 0; fi
  local c
  for c in "$home_dir/.local/bin/claude" "$home_dir/.claude/local/claude"; do
    if [[ -x "$c" ]]; then printf '%s' "$c"; return 0; fi
  done
  return 1
}

new_version="$(claude_version "$package_plugin")"
[[ -n "$new_version" && -f "$package_plugin/mcp_server.mjs" ]] || {
  echo "$(t 'Brak folderu "gm-coach" obok aktualizatora. Rozpakuj cale archiwum.' 'The "gm-coach" folder is missing next to the updater. Extract the whole archive.')" >&2; exit 1; }
old_version="$(claude_version "$plugin_dir")"
if [[ -z "$old_version" ]]; then
  echo "$(t "Nie znaleziono zainstalowanego GM Coach dla Claude w $plugin_dir. Aktualizator jest dla osob, ktore juz maja wtyczke; uzyj instalatora." "GM Coach for Claude was not found in $plugin_dir. The updater is for people who already have the plugin; use the installer.")"
  exit 2
fi
if [[ -L "$install_root" || -L "$market_dir" || -L "$plugin_dir" ]]; then
  echo "$(t 'Folder instalacji jest dowiazaniem symbolicznym. Przenies go i uruchom ponownie.' 'The install folder is a symbolic link. Move it aside and run again.')" >&2; exit 1
fi
step "$(t "Zainstalowana wersja: $old_version; wersja w paczce: $new_version" "Installed version: $old_version; version in this package: $new_version")"
if semver_gt "$old_version" "$new_version" && (( force == 0 )); then
  echo "$(t 'Zainstalowana wersja jest nowsza niz ta w paczce. Nic nie zmieniam (--force cofa wersje).' 'The installed version is newer than the one in this package. Nothing changed (--force downgrades).')"; exit 2
fi
if [[ "$old_version" == "$new_version" ]] && (( force == 0 )); then
  echo "$(t 'Masz juz te wersje. Nic do zrobienia (--force wymusza ponowna podmiane).' 'You already have this version. Nothing to do (--force replaces the files again).')"; exit 2
fi
missing=0
for item in runtime/bin/node bin/speediance-cli node_modules/@napi-rs .mcp.json; do
  if [[ -e "$plugin_dir/$item" ]]; then
    printf '  %-26s %s\n' "$item" "$(t 'zostaje (bez pobierania)' 'kept (no download)')"
  else
    printf '  %-26s %s\n' "$item" "$(t 'BRAK' 'MISSING')"; missing=1
  fi
done
if (( missing )); then
  echo "$(t 'Brakuje skladnikow - ten aktualizator nic nie pobiera. Uruchom pelny instalator (install-claude-macos.sh / install-claude-linux.sh).' 'Components are missing - this updater downloads nothing. Run the full installer (install-claude-macos.sh / install-claude-linux.sh).')"
  exit 4
fi
if [[ -f "$plugin_dir/scripts/keyring-runtime.json" && -f "$package_plugin/scripts/keyring-runtime.json" ]] && (( force == 0 )) && \
   ! cmp -s "$plugin_dir/scripts/keyring-runtime.json" "$package_plugin/scripts/keyring-runtime.json"; then
  echo "$(t 'Nowa wersja wymaga innych skladnikow (magazyn hasel). Uruchom pelny instalator - dane i haslo zostana zachowane.' 'The new version needs different components (credential store). Run the full installer - your data and password are kept.')"
  exit 4
fi
if (( check_only )); then echo "$(t 'Tryb --check-only: nic nie zmieniono.' 'Check-only mode: nothing changed.')"; exit 0; fi

# ---------------------------------------------------------------- kopia zapasowa i podmiana / backup and swap
stamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$install_root/backup-$old_version-$stamp"
backup_plugin="$backup_dir/gm-coach"

rollback() {
  echo "$(t "BLAD: $1" "ERROR: $1")" >&2
  if [[ ! -d "$backup_plugin" ]]; then
    echo "$(t 'Poprzednia wersja nie zostala zmieniona.' 'The previous version was not changed.')" >&2; return 0
  fi
  step "$(t 'Przywracanie poprzedniej wersji' 'Restoring the previous version')"
  local entry name
  for entry in "$plugin_dir"/* "$plugin_dir"/.[!.]*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="$(basename "$entry")"
    is_preserved "$name" || rm -rf -- "$entry"
  done
  for entry in "$backup_plugin"/* "$backup_plugin"/.[!.]*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    mv "$entry" "$plugin_dir/$(basename "$entry")"
  done
  [[ -f "$backup_dir/marketplace.json" ]] && cp "$backup_dir/marketplace.json" "$market_json"
  rm -rf -- "$backup_dir"
  echo "$(t "Przywrocono wersje $old_version. Dane i ustawienia nie byly ruszane." "Restored version $old_version. Your data and settings were never touched.")"
}

step "$(t "Aktualizacja do $new_version (kopia poprzedniej wersji: $backup_dir)" "Updating to $new_version (backup of the previous version: $backup_dir)")"
swap() {
  local entry name
  mkdir -p "$backup_plugin"
  cp "$market_json" "$backup_dir/marketplace.json"
  for entry in "$plugin_dir"/* "$plugin_dir"/.[!.]*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="$(basename "$entry")"
    is_preserved "$name" || mv "$entry" "$backup_plugin/$name"
  done
  for entry in "$package_plugin"/* "$package_plugin"/.[!.]*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="$(basename "$entry")"
    is_preserved "$name" || cp -R "$entry" "$plugin_dir/$name"
  done
  # Wersja w marketplace.json: zamiana tylko pola "version" wpisu gm-coach / update only the version field.
  sed "s/\"version\"[[:space:]]*:[[:space:]]*\"$old_version\"/\"version\": \"$new_version\"/" "$backup_dir/marketplace.json" > "$market_json"
  grep -q "\"$new_version\"" "$market_json"
}
if ! swap; then
  rollback "$(t 'Podmiana plikow nie powiodla sie.' 'Replacing the files failed.')"; exit 1
fi

# ---------------------------------------------------------------- sprawdzenie serwera / server check
step "$(t 'Sprawdzanie serwera MCP (initialize + tools/list)' 'Checking the MCP server (initialize + tools/list)')"
verify_out="$("$node_bin" "$verify_script" "$plugin_dir" "$new_version" 2>&1)" || true
case "$verify_out" in
  *'"ok":true'*) echo "$(t 'Serwer MCP dziala:' 'MCP server works:') $verify_out" ;;
  *) rollback "$(t 'Serwer MCP nie przeszedl sprawdzenia:' 'The MCP server did not pass the check:') $verify_out"; exit 1 ;;
esac

# ---------------------------------------------------------------- Claude Code
exit_code=0
cli="$(find_claude || true)"
if [[ -n "$cli" ]] && ! "$cli" plugin marketplace list 2>/dev/null | grep -q "$market_name"; then
  echo "$(t 'Claude Code nie zna marketplace gm-coach-local (wtyczka nie byla instalowana przez instalator?). Pliki sa zaktualizowane; uruchom pelny instalator, aby zarejestrowac wtyczke.' 'Claude Code does not know the gm-coach-local marketplace (was the plugin installed by the installer?). The files are updated; run the full installer to register the plugin.')" >&2
  exit_code=3
elif [[ -n "$cli" ]]; then
  step "$(t 'Claude Code: odswiezanie wtyczki' 'Claude Code: refreshing the plugin')"
  if "$cli" plugin marketplace update "$market_name" >/dev/null 2>&1 && "$cli" plugin update "$plugin_id" >/dev/null 2>&1; then
    :
  else
    rollback "$(t "Polecenie 'claude plugin update' nie powiodlo sie." "'claude plugin update' failed.")"
    "$cli" plugin marketplace update "$market_name" >/dev/null 2>&1 || true
    exit 1
  fi
else
  echo "$(t 'Nie znaleziono Claude Code CLI. Pliki sa zaktualizowane; w aplikacji Claude zaktualizuj GM Coach w panelu wtyczek (albo: claude plugin update gm-coach@gm-coach-local).' 'Claude Code CLI not found. The files are updated; update GM Coach in the Claude app plugins panel (or: claude plugin update gm-coach@gm-coach-local).')" >&2
  exit_code=3
fi
# Zachowaj dwie ostatnie kopie / keep the two latest backups.
ls -1d "$install_root"/backup-* 2>/dev/null | sort -r | tail -n +3 | while IFS= read -r old; do rm -rf -- "$old"; done
echo ''
echo "$(t "Kopia poprzedniej wersji ($old_version): $backup_dir" "Backup of the previous version ($old_version): $backup_dir")"
echo "$(t 'Dane, profil i haslo nie byly ruszane - ponowne logowanie nie jest potrzebne.' 'Data, profile and password were not touched - no new sign-in is needed.')"
(( exit_code == 0 )) && echo "$(t 'Gotowe. Otworz nowa sesje Claude Code lub nowy czat.' 'Done. Open a new Claude Code session or a new chat.')"
exit $exit_code
