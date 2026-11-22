#!/usr/bin/env bash
# GM Coach dla Claude Code - Linux / for Claude Code - Linux.
# Uzycie / Usage: bash install-claude-linux.sh [--language pl|en] [--uninstall] [--refresh-dependencies]
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export GM_COACH_EXPECTED_OS=linux
exec bash "$script_dir/install-claude-unix.sh" ${1+"$@"}
