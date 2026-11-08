#!/usr/bin/env sh
# Installs (or removes with --remove) a user-level desktop entry for the development build.
#
# Linux desktop portals identify apps by their desktop entry, so the global shortcut portal
# (Wayland) only works for development builds once this entry exists. Packages (.deb/.rpm/
# AppImage) ship their own entry; this script is for `pnpm tauri dev` only.
set -eu

APP_ID="app.piw.Piw"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$ROOT/src-tauri/target/debug/piw"
DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
FILE="$DIR/$APP_ID.desktop"

if [ "${1:-}" = "--remove" ]; then
  rm -f "$FILE"
  echo "Removed $FILE"
  exit 0
fi

mkdir -p "$DIR"
cat >"$FILE" <<ENTRY
[Desktop Entry]
Type=Application
Name=Piw (dev)
Comment=Minimal, local-first notes and tasks
Exec=$BIN %U
Icon=$ROOT/src-tauri/icons/128x128.png
Terminal=false
Categories=Utility;Office;
StartupWMClass=piw
X-KDE-Shortcuts=
NoDisplay=true
ENTRY
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DIR" >/dev/null 2>&1 || true
echo "Installed $FILE"
