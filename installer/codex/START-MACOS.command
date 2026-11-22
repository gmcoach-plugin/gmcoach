#!/bin/bash
set -euo pipefail
gm_coach_package_dir="$(cd "$(dirname "$0")" && pwd)"
echo 'GM Coach - instalacja lub aktualizacja; instalator zapyta o opcjonalny tunel ChatGPT.'
echo 'GM Coach - install or update; the installer asks about the optional ChatGPT tunnel.'
# install-macos.sh pyta o jezyk / asks for the language (pl|en).
bash "$gm_coach_package_dir/install-macos.sh" ${1+"$@"}
