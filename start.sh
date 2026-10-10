#!/usr/bin/env bash
# Run in the dot cloud desktop Terminal, whose localhost serves the visible browser.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/dot-panel-main" && pwd)"
exec python3 "$ROOT/local/desktop-start.py" "$@"
