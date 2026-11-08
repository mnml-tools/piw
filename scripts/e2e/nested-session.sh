#!/usr/bin/env sh
# Runs a native end-to-end scenario inside a private, virtual KWin session (Linux only).
#
# The nested compositor has its own Wayland socket, XWayland display and D-Bus session, so the
# scenario can drive Piw's real windows with xdotool and take screenshots with spectacle
# without touching the user's desktop (it even works while the screen is locked).
#
# Usage: scripts/e2e/nested-session.sh <scenario.sh> [output-dir]
#   The scenario runs with DISPLAY set to the nested XWayland, PIW_BIN pointing at the binary,
#   OUT pointing at the output directory and PIW_DATA_DIR at a fresh data directory.
#   By default the release binary is used (`pnpm tauri build --no-bundle`): it embeds the
#   frontend, starts deterministically and exercises the production CSP and capabilities.
#   Set PIW_BIN=src-tauri/target/debug/piw (with `pnpm dev` running) to test a debug build.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCENARIO="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
OUT="${2:-$ROOT/target-e2e/$(basename "$1" .sh)}"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
WIDTH="${E2E_WIDTH:-1400}"
HEIGHT="${E2E_HEIGHT:-900}"

for tool in kwin_wayland dbus-run-session xdotool spectacle; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing tool: $tool" >&2; exit 2; }
done

# A previous run's helpers may still be exiting: retry the cleanup briefly.
for _ in 1 2 3 4 5; do rm -rf "$OUT" 2>/dev/null && break; sleep 1; done
mkdir -p "$OUT/data" "$OUT/config"
# Private config for the nested compositor only (the user's ~/.config is never touched):
# let xdotool drive XWayland windows without KWin's remote-input permission prompt.
cat >"$OUT/config/kwinrc" <<'CONF'
[Xwayland]
XwaylandEisNoPrompt=true
CONF
export XDG_CONFIG_HOME="$OUT/config"
# Webview storage (localStorage) lives under the app-data dir: isolate it per run too.
mkdir -p "$OUT/share"
export XDG_DATA_HOME="$OUT/share"
PIW_BIN="${PIW_BIN:-$ROOT/src-tauri/target/release/piw}"
[ -x "$PIW_BIN" ] || { echo "missing binary: $PIW_BIN (run: pnpm tauri build --no-bundle)" >&2; exit 2; }
export OUT PIW_BIN PIW_DATA_DIR="$OUT/data" ROOT

exec timeout "${E2E_TIMEOUT:-180}" dbus-run-session -- \
  kwin_wayland --virtual --xwayland --no-lockscreen --width "$WIDTH" --height "$HEIGHT" \
  --socket "piw-e2e-$$" --exit-with-session "sh -eu $SCENARIO" >"$OUT/kwin.log" 2>&1
