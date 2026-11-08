# Helpers for nested-session scenarios (sourced).

# xdotool talks X11 (XTEST) to the nested XWayland, where Piw's windows live. Without this it
# would go through the Wayland RemoteDesktop portal and wait for a permission dialog.
xdo() {
  env -u WAYLAND_DISPLAY xdotool "$@"
}

# Starts Piw in the nested session (always via XWayland so xdotool can drive it).
start_piw() {
  env -u GDK_BACKEND -u WAYLAND_DISPLAY "$PIW_BIN" "$@" >>"$OUT/piw.log" 2>&1 &
  PIW_PID=$!
  i=0
  until grep -q "launch action" "$OUT/piw.log" 2>/dev/null; do
    i=$((i + 1)); [ "$i" -gt 150 ] && { echo "Piw did not start" >&2; return 1; }
    sleep 0.2
  done
  sleep 2  # let the hidden windows load their webviews
}

# Runs the CLI fallback entry point (second instance forwarding argv to the running app).
piw_cli() {
  env -u GDK_BACKEND -u WAYLAND_DISPLAY "$PIW_BIN" "$@" >/dev/null 2>&1 || true
}

# wait_for_window <name regex> <seconds>
wait_for_window() {
  i=0
  while [ "$i" -lt "$(( $2 * 5 ))" ]; do
    if xdo search --onlyvisible --name "$1" >/dev/null 2>&1; then
      sleep 1.5  # let the webview paint
      return 0
    fi
    i=$((i + 1)); sleep 0.2
  done
  echo "window '$1' did not appear" >&2
  return 1
}

# shot <name>: full screenshot of the virtual output.
shot() {
  spectacle -b -n -f -o "$OUT/$1.png" >/dev/null 2>&1
  echo "screenshot: $OUT/$1.png"
}

focus_window() {
  id="$(xdo search --onlyvisible --name "$1" | head -1)"
  xdo windowactivate --sync "$id" 2>/dev/null || xdo windowfocus --sync "$id"
}

# type_text <text>: types into the focused window.
type_text() {
  xdo type --delay 15 -- "$1"
}

key() {
  xdo key --delay 40 "$@"
}

# Stops Piw and its WebKit helpers and waits for them, so nothing keeps writing to $OUT.
stop_piw() {
  children="$(pgrep -P "$PIW_PID" 2>/dev/null || true)"
  kill "$PIW_PID" 2>/dev/null || true
  for child in $children; do kill "$child" 2>/dev/null || true; done
  i=0
  while kill -0 "$PIW_PID" 2>/dev/null && [ "$i" -lt 50 ]; do i=$((i + 1)); sleep 0.1; done
}

# assert_sql <description> <sql> <expected>: compares the first column of every row (joined
# with "|") against <expected>. Results are appended to $OUT/result.txt.
assert_sql() {
  actual="$(python3 - "$PIW_DATA_DIR/piw.sqlite3" "$2" <<'PY'
import sqlite3, sys
rows = sqlite3.connect(sys.argv[1]).execute(sys.argv[2]).fetchall()
print("|".join(str(r[0]) for r in rows))
PY
)"
  if [ "$actual" = "$3" ]; then
    echo "PASS $1" >>"$OUT/result.txt"
  else
    echo "FAIL $1: expected [$3], got [$actual]" >>"$OUT/result.txt"
  fi
}

assert_hidden() {
  if xdo search --onlyvisible --name "$1" >/dev/null 2>&1; then
    echo "FAIL $2: '$1' still visible" >>"$OUT/result.txt"
  else
    echo "PASS $2" >>"$OUT/result.txt"
  fi
}
