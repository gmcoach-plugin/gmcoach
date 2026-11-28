#!/bin/bash
# GM Coach - aktualizacja dla Claude na macOS: dwukrotne klikniecie / double-click to update.
cd "$(dirname "$0")" || exit 1
bash ./update-claude-macos-linux.sh
code=$?
echo
read -r -p "Enter, aby zamknac / Press Enter to close " _
exit $code
