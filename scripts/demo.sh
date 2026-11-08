#!/usr/bin/env sh
# Opens Piw on a separate, richly seeded demo database (your real notes are never touched).
#   scripts/demo.sh            reuse the demo data if it exists, else create it
#   scripts/demo.sh --reset    start again from fresh demo data
# Env: PIW_BIN (default: the release build), PIW_DEMO_DIR, PIW_DEMO_THEME=light|dark|system.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${PIW_BIN:-$ROOT/src-tauri/target/release/piw}"
DIR="${PIW_DEMO_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/piw-demo}"
THEME="${PIW_DEMO_THEME:-system}"
[ -x "$BIN" ] || { echo "missing $BIN (build it with: pnpm tauri build --no-bundle)" >&2; exit 2; }
if pgrep -x piw >/dev/null 2>&1; then
  echo "Piw is already running: quit it first (tray → Quit), otherwise the demo opens your real app." >&2
  exit 1
fi
[ "${1:-}" = "--reset" ] && rm -rf "$DIR"
if [ ! -f "$DIR/piw.sqlite3" ]; then
  mkdir -p "$DIR"
  # A first, hidden launch creates the database and runs the migrations.
  PIW_DATA_DIR="$DIR" "$BIN" --hidden >"$DIR/first-launch.log" 2>&1 &
  pid=$!
  i=0
  until grep -q "launch action" "$DIR/first-launch.log" 2>/dev/null; do
    i=$((i + 1)); [ "$i" -gt 100 ] && { kill "$pid"; echo "Piw did not start" >&2; exit 1; }
    sleep 0.2
  done
  sleep 1
  kill "$pid"; wait "$pid" 2>/dev/null || true
  python3 "$ROOT/scripts/seed-rich.py" "$DIR/piw.sqlite3" "$THEME"
fi
echo "Opening Piw with demo data in $DIR"
PIW_DATA_DIR="$DIR" exec "$BIN"
