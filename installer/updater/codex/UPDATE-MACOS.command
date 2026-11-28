#!/bin/bash
# GM Coach - aktualizacja na macOS: dwukrotne klikniecie / double-click to update (Codex).
cd "$(dirname "$0")" || exit 1
bash ./update-macos-linux.sh
code=$?
echo
read -r -p "Enter, aby zamknac / Press Enter to close " _
exit $code
