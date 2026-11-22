#!/usr/bin/env bash
# GM Coach dla Claude Code - macOS / for Claude Code - macOS.
# Uzycie / Usage: bash install-claude-macos.sh [--language pl|en] [--uninstall] [--refresh-dependencies]
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GM_COACH_EXPECTED_OS=macos
exec bash "$script_dir/install-claude-unix.sh" ${1+"$@"}
