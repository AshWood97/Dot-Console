#!/usr/bin/env bash
# Install/remove a standard current-user XDG desktop-session entry. No root required.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}"
ENTRY="$CONFIG/autostart/dot-console.desktop"
case "${1:-}" in
  --disable)
    if [[ -f "$ENTRY" ]] && grep -q '^X-Dot-Console-Managed=true$' "$ENTRY"; then
      # Reversible XDG disable; no deletion.
      sed -i 's/^Hidden=.*/Hidden=true/' "$ENTRY"
      echo "Dot Console desktop-session autostart disabled: $ENTRY"
    else echo "No managed Dot Console autostart entry found."; fi
    exit 0 ;;
  --enable) ;;
  *) echo 'Usage: bash local/install-desktop.sh --enable | --disable'; exit 2 ;;
esac
[[ -n "${DISPLAY:-}" ]] || { echo 'Run this installer in the intended Linux cloud desktop Terminal (no DISPLAY here).'; exit 1; }
command -v python3 >/dev/null
if [[ -e "$ENTRY" ]] && ! grep -q '^X-Dot-Console-Managed=true$' "$ENTRY"; then
  echo "Refusing to replace an unmanaged entry: $ENTRY"; exit 1
fi
mkdir -p "$CONFIG/autostart"
# Encode the desktop Exec path, including percent field-code escaping.
python3 - "$ROOT" "$ENTRY" <<'PY'
from pathlib import Path
import sys
root, entry = sys.argv[1:]
path = root + '/local/desktop-start.py'
escaped = path.replace('\\', '\\\\\\\\').replace('"', '\\\\"').replace('`', '\\\\`').replace('$', '\\\\$').replace('%', '%%')
Path(entry).write_text('[Desktop Entry]\nType=Application\nName=Dot Console\nComment=Start the local panel once at desktop login\nExec=python3 "' + escaped + '" --session-start\nTerminal=false\nHidden=false\nX-Dot-Console-Managed=true\n')
PY
echo "Enabled desktop login startup: $ENTRY"
exec python3 "$ROOT/local/desktop-start.py"
