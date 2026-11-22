#!/usr/bin/env bash
# Dwuklik w Finderze (po: chmod +x START-CLAUDE-MACOS.command) / Double-click in Finder (after chmod +x).
cd "$(dirname "$0")" || exit 1
echo "GM Coach - instalacja dla Claude / installer for Claude (macOS)"
echo
if [ ! -f "./install-claude-unix.sh" ] || [ ! -d "./marketplace-unix" ]; then
  echo "BLAD: rozpakuj cale archiwum ZIP i uruchom ten plik z rozpakowanego folderu."
  echo "ERROR: extract the whole ZIP archive and run this file from the extracted folder."
  read -r -p "Enter..." _ || true
  exit 1
fi
bash ./install-claude-macos.sh ${1+"$@"}
status=$?
echo
read -r -p "Enter..." _ || true
exit $status
