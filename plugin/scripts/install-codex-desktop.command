#!/bin/sh
SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
exec /bin/bash "$SCRIPT_DIR/install-codex-desktop.sh" "$@"
