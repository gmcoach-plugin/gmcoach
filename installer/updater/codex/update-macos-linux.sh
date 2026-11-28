#!/usr/bin/env bash
# GM Coach - aktualizator dla Codex (macOS i Linux) / updater for Codex (macOS and Linux).
# Uzycie / Usage:
#   bash update-macos-linux.sh                  # aktualizacja / update
#   bash update-macos-linux.sh --language en    # jezyk komunikatow / message language: pl|en
#   bash update-macos-linux.sh --check-only     # tylko sprawdz, nic nie zmieniaj / only check, change nothing
#   bash update-macos-linux.sh --force          # podmien pliki nawet przy tej samej lub nowszej wersji
# Podmienia tylko pliki pluginu. Zostaja: runtime Node, speediance-cli, node_modules (keyring), dane i profil,
# haslo w Keychain / Secret Service, ustawienia tunelu ChatGPT. Kopia zapasowa + rollback przy bledzie.
# Replaces only the plugin files. Kept: Node runtime, speediance-cli, node_modules (keyring), data and profile,
# the saved password in Keychain / Secret Service, ChatGPT tunnel settings. Backup + rollback on error.
# Kody wyjscia / exit codes: 0 OK, 1 blad (przywrocono) / error (restored), 2 nic do zrobienia / nothing to do,
# 3 pliki zaktualizowane, aktywacji Codex nie potwierdzono / files updated, Codex activation not confirmed.
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
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
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
step() { printf '==> %s\n' "$*"; }

# GM_COACH_TEST_UNAME: tylko do testow / for tests only
case "${GM_COACH_TEST_UNAME:-$(uname -s)}" in
  Darwin) os=macos ;;
  Linux) os=linux ;;
  *) echo "$(t 'Nieobslugiwany system. Na Windows uzyj UPDATE-WINDOWS.cmd.' 'Unsupported operating system. On Windows use UPDATE-WINDOWS.cmd.')" >&2; exit 1 ;;
esac

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
package_root="$script_dir/plugin"
verify_script="$script_dir/verify-server.mjs"
home_dir="${HOME:?Brak HOME / HOME is not set}"
codex_home="${CODEX_HOME:-$home_dir/.codex}"
if [[ "$codex_home" != /* ]]; then codex_home="$PWD/$codex_home"; fi
plugin_parent="$codex_home/plugins"
plugin_dir="$plugin_parent/gm-coach"

# Wersja z plugin.json bez zaleznosci od node/jq / version from plugin.json without node or jq.
read_version() { [[ -f "$1/plugin.json" ]] && awk -F'"' '/"version"[[:space:]]*:/ { print $4; exit }' "$1/plugin.json" || true; }
semver_of() { printf '%s' "$1" | sed -n 's/^\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p'; }
# Zwraca 0 gdy $1 > $2 (porownanie numeryczne x.y.z) / returns 0 when $1 > $2.
semver_gt() {
  local a="$1" b="$2" i x y
  for i in 1 2 3; do
    x="$(printf '%s' "$a" | cut -d. -f$i)"; y="$(printf '%s' "$b" | cut -d. -f$i)"
    (( 10#$x > 10#$y )) && return 0
    (( 10#$x < 10#$y )) && return 1
  done
  return 1
}

new_version="$(read_version "$package_root")"
[[ -n "$new_version" && -f "$package_root/scripts/install-codex-desktop.sh" ]] || {
  echo "$(t 'Brak folderu "plugin" obok aktualizatora. Rozpakuj cale archiwum.' 'The "plugin" folder is missing next to the updater. Extract the whole archive.')" >&2; exit 1; }
old_version="$(read_version "$plugin_dir")"
if [[ -z "$old_version" ]]; then
  echo "$(t "Nie znaleziono zainstalowanego GM Coach w $plugin_dir. Aktualizator jest dla osob, ktore juz maja plugin; uzyj instalatora." "GM Coach is not installed in $plugin_dir. The updater is for people who already have the plugin; use the installer.")"
  exit 2
fi
step "$(t "Zainstalowana wersja: $old_version; wersja w paczce: $new_version" "Installed version: $old_version; version in this package: $new_version")"
old_sem="$(semver_of "$old_version")"; new_sem="$(semver_of "$new_version")"
[[ -n "$old_sem" && -n "$new_sem" ]] || { echo "$(t 'Nie mozna odczytac numerow wersji.' 'Could not read the version numbers.')" >&2; exit 1; }
if semver_gt "$old_sem" "$new_sem" && (( force == 0 )); then
  echo "$(t 'Zainstalowana wersja jest nowsza niz ta w paczce. Nic nie zmieniam (--force cofa wersje).' 'The installed version is newer than the one in this package. Nothing changed (--force downgrades).')"
  exit 2
fi
if [[ "$old_version" == "$new_version" ]] && (( force == 0 )); then
  echo "$(t 'Masz juz te wersje. Nic do zrobienia (--force wymusza ponowna podmiane).' 'You already have this version. Nothing to do (--force replaces the files again).')"
  exit 2
fi
node_bin="$plugin_dir/runtime/bin/node"
for item in runtime/bin/node bin/speediance-cli node_modules/@napi-rs; do
  if [[ -e "$plugin_dir/$item" ]]; then
    printf '  %-26s %s\n' "$item" "$(t 'zostaje (bez pobierania)' 'kept (no download)')"
  else
    printf '  %-26s %s\n' "$item" "$(t 'BRAK - zostanie pobrany i zweryfikowany (SHA-256)' 'MISSING - will be downloaded and verified (SHA-256)')"
  fi
done
if (( check_only )); then echo "$(t 'Tryb --check-only: nic nie zmieniono.' 'Check-only mode: nothing changed.')"; exit 0; fi

list_backups() { find "$plugin_parent" -maxdepth 1 -type d -name '.gm-coach-backup.*' 2>/dev/null | sort; }
before="$(list_backups)"

# ---------------------------------------------------------------- aktualizacja / update
step "$(t "Aktualizacja do $new_version (kopia zapasowa poprzedniej wersji powstaje automatycznie)" "Updating to $new_version (a backup of the previous version is made automatically)")"
inner_exit=0
bash "$package_root/scripts/install-codex-desktop.sh" --update || inner_exit=$?
backup=''
while IFS= read -r candidate; do
  [[ -z "$candidate" ]] && continue
  if ! printf '%s\n' "$before" | grep -Fxq -- "$candidate"; then backup="$candidate"; fi
done <<EOF
$(list_backups)
EOF

restart_tunnel() {
  # Dzialajacy tunel trzyma stary katalog otwarty; restart podlacza nowe pliki. Best effort.
  if [[ "$os" == macos ]]; then
    local label='com.gmcoach.chatgpt-tunnel'
    if launchctl print "gui/$(id -u)/$label" >/dev/null 2>&1; then
      launchctl kickstart -k "gui/$(id -u)/$label" >/dev/null 2>&1 && echo "$(t 'Tunel ChatGPT uruchomiony ponownie.' 'ChatGPT tunnel restarted.')" || true
    fi
  elif command -v systemctl >/dev/null 2>&1; then
    if systemctl --user is-active --quiet gm-coach-tunnel.service 2>/dev/null; then
      systemctl --user restart gm-coach-tunnel.service >/dev/null 2>&1 && echo "$(t 'Tunel ChatGPT uruchomiony ponownie.' 'ChatGPT tunnel restarted.')" || true
    fi
  fi
}

rollback() {
  echo "$(t "BLAD: $1" "ERROR: $1")" >&2
  if [[ -z "$backup" || ! -d "$backup" ]]; then
    echo "$(t 'Poprzednia wersja nie zostala zmieniona (aktualizacja nie doszla do podmiany plikow).' 'The previous version was not changed (the update stopped before replacing files).')" >&2
    return 0
  fi
  step "$(t 'Przywracanie poprzedniej wersji' 'Restoring the previous version')"
  local failed="$plugin_parent/.gm-coach-failed.$$"
  if [[ -e "$plugin_dir" ]]; then mv "$plugin_dir" "$failed"; fi
  mv "$backup" "$plugin_dir"
  rm -rf -- "$failed"
  echo "$(t "Przywrocono wersje $old_version. Dane i ustawienia nie byly ruszane." "Restored version $old_version. Your data and settings were never touched.")"
}

installed_now="$(read_version "$plugin_dir")"
if [[ "$installed_now" != "$new_version" ]]; then
  rollback "$(t "Po aktualizacji wersja to '$installed_now', oczekiwano '$new_version' (kod instalatora: $inner_exit)." "After the update the version is '$installed_now', expected '$new_version' (installer code: $inner_exit).")"
  exit 1
fi
step "$(t 'Sprawdzanie serwera MCP (initialize + tools/list)' 'Checking the MCP server (initialize + tools/list)')"
verify_out=''
if [[ -x "$node_bin" ]]; then verify_out="$("$node_bin" "$verify_script" "$plugin_dir" "$new_sem" 2>&1)" || true; fi
case "$verify_out" in
  *'"ok":true'*) echo "$(t 'Serwer MCP dziala:' 'MCP server works:') $verify_out" ;;
  *) rollback "$(t 'Serwer MCP nie przeszedl sprawdzenia:' 'The MCP server did not pass the check:') $verify_out"; exit 1 ;;
esac
restart_tunnel
echo ''
[[ -n "$backup" ]] && echo "$(t "Kopia poprzedniej wersji ($old_version): $backup" "Backup of the previous version ($old_version): $backup")"
echo "$(t 'Dane, profil, haslo i ustawienia tunelu nie byly ruszane - ponowne logowanie nie jest potrzebne.' 'Data, profile, password and tunnel settings were not touched - no new sign-in is needed.')"
if (( inner_exit != 0 )); then
  echo "$(t 'Pliki sa zaktualizowane, ale Codex CLI nie potwierdzil aktywacji (np. brak polecenia codex w PATH). Uruchom ponownie Codex i otworz nowy czat; w razie braku narzedzi GM Coach uruchom pelny instalator.' 'The files are updated, but the Codex CLI did not confirm activation (for example, no codex command in PATH). Restart Codex and open a new chat; if GM Coach tools are missing, run the full installer.')" >&2
  exit 3
fi
echo "$(t 'Gotowe. Zrestartuj Codex i otworz nowy czat.' 'Done. Restart Codex and open a new chat.')"
