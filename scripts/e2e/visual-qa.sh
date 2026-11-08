# Visual QA screenshots of every window on the real build (light or dark, one window size).
# SEED=demo|rich (scripts/seed-rich.py fills every view)  THEME=light|dark  SIZE=WIDTHxHEIGHT of the main window in X11 pixels (default 1280x800).
# XFT_DPI=134 reproduces a 140 % KDE desktop (WebKitGTK scales CSS px by dpi/96; then use
# SIZE=1792x1120 for a 1280x800 CSS-px window and a larger E2E_WIDTH/E2E_HEIGHT).
# Run: E2E_WIDTH=2000 E2E_HEIGHT=1200 THEME=dark scripts/e2e/nested-session.sh scripts/e2e/visual-qa.sh
. "$ROOT/scripts/e2e/lib.sh"
THEME="${THEME:-light}"
SIZE="${SIZE:-1280x800}"
W="${SIZE%x*}"
H="${SIZE#*x}"
NARROW=$((700 * ${XFT_DPI:-96} / 96))  # a 700 CSS-px window

# crop_window <name regex> <out>: the window's frame (client area + KWin decoration).
crop_window() {
  id="$(xdo search --onlyvisible --name "$1" | head -1)"
  eval "$(xdo getwindowgeometry --shell "$id")"
  shot "_full"
  magick "$OUT/_full.png" -crop "${WIDTH}x${HEIGHT}+${X}+${Y}" +repage "$OUT/$2.png"
  rm -f "$OUT/_full.png"
  echo "screenshot: $OUT/$2.png"
}

place_main() {
  id="$(xdo search --onlyvisible --name "^Piw$" | head -1)"
  xdo windowsize --sync "$id" "$1" "$2" 2>/dev/null || xdo windowsize "$id" "$1" "$2"
  xdo windowmove --sync "$id" 20 40 2>/dev/null || xdo windowmove "$id" 20 40
  sleep 1
}

# KWin starts XWayland on demand and restarts it when the last client quits, which drops X
# resources: set the DPI again before every launch.
set_dpi() {
  if [ -n "${XFT_DPI:-}" ]; then
    printf 'Xft.dpi: %s\n' "$XFT_DPI" | env -u WAYLAND_DISPLAY xrdb -merge
  fi
}

# ---- Run 1: empty database (first launch) — empty states ----
set_dpi
start_piw --hidden
stop_piw
sleep 2
python3 - "$PIW_DATA_DIR/piw.sqlite3" "$THEME" <<'PY'
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
ts = "2026-11-06T09:00:00.000Z"
for key, value in [("theme", sys.argv[2]), ("trayNoticeShown", True)]:
    db.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)", (key, json.dumps(value), ts))
db.commit()
PY
set_dpi
start_piw
wait_for_window "^Piw$" 20
place_main "$W" "$H"
focus_window "^Piw$"
key ctrl+2
sleep 1.2
crop_window "^Piw$" "empty-notes-$THEME"
key ctrl+3
sleep 1.2
crop_window "^Piw$" "empty-tasks-$THEME"
key ctrl+1
sleep 1.2
crop_window "^Piw$" "empty-inbox-$THEME"
stop_piw
sleep 2

# ---- Run 2: demo content + three stickies restored at launch ----
rm -rf "$PIW_DATA_DIR"/*
set_dpi
start_piw --hidden
stop_piw
sleep 2
if [ "${SEED:-demo}" = rich ]; then
  python3 "$ROOT/scripts/seed-rich.py" "$PIW_DATA_DIR/piw.sqlite3" "$THEME" >/dev/null
else
  python3 "$ROOT/scripts/e2e/seed-demo.py" "$PIW_DATA_DIR/piw.sqlite3" "$THEME" >/dev/null
fi
python3 - "$PIW_DATA_DIR/piw.sqlite3" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
ts = "2026-11-06T09:00:00.000Z"
note = db.execute("SELECT id FROM notes WHERE kind = 'quick_note' AND body LIKE 'Gift ideas%'").fetchone()[0]
task = db.execute("SELECT id FROM tasks WHERE title = 'Add unit tests for TOTP verification'").fetchone()[0]
tab = db.execute("SELECT id FROM document_tabs WHERE kind = 'tasks'").fetchone()[0]
rows = [("note", note, 40, 520, 300, 240, "yellow"), ("task", task, 520, 520, 320, 240, None), ("tasks_tab", tab, 1020, 520, 320, 260, "mint")]
for kind, target, x, y, w, h, color in rows:
    db.execute(
        "INSERT OR REPLACE INTO sticky_windows (target_kind, target_id, x, y, width, height, always_on_top, color, is_open, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)", (kind, target, x, y, w, h, color, ts, ts))
db.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('restoreStickiesOnLaunch', 'true', ?)", (ts,))
db.commit()
PY

set_dpi
start_piw --hidden
wait_for_window "Piw sticky" 15
sleep 2
shot "stickies-$THEME"
i=0
for sid in $(xdo search --onlyvisible --name "Piw sticky"); do
  i=$((i + 1))
  eval "$(xdo getwindowgeometry --shell "$sid")"
  magick "$OUT/stickies-$THEME.png" -crop "${WIDTH}x${HEIGHT}+${X}+${Y}" +repage "$OUT/sticky-$i-$THEME.png"
done
magick montage "$OUT"/sticky-?-"$THEME".png -tile x1 -geometry +12+12 -background none \
  "$OUT/stickies-row-$THEME.png"
# Close the stickies so they do not cover the workspace shots (Mod+W hides; pins stay).
for sid in $(xdo search --onlyvisible --name "Piw sticky"); do
  xdo windowactivate --sync "$sid" 2>/dev/null || true
  key ctrl+w
  sleep 0.5
done

piw_cli  # a second instance with no flags shows the workspace
wait_for_window "^Piw$" 20
place_main "$W" "$H"
focus_window "^Piw$"
key ctrl+3
sleep 1.5
crop_window "^Piw$" "tasks-$THEME"
key ctrl+2
sleep 1.5
crop_window "^Piw$" "notes-$THEME"
key ctrl+1
sleep 1.5
crop_window "^Piw$" "inbox-$THEME"
key ctrl+4
sleep 1.5
crop_window "^Piw$" "pinned-$THEME"
key ctrl+comma
sleep 1.5
crop_window "^Piw$" "settings-$THEME"

# Search palette with results.
key ctrl+k
sleep 0.6
type_text "re"
sleep 1.2
crop_window "^Piw$" "search-$THEME"
key Escape
sleep 0.5

# Task details: open a task through search.
key ctrl+k
sleep 0.6
type_text "Prepare the demo"
sleep 1
key Return
sleep 1.8
crop_window "^Piw$" "task-drawer-$THEME"
key Escape
sleep 0.5

# Document (Overview tab), then the next tabs with the keyboard from the tab list.
key ctrl+k
sleep 0.6
type_text "Refactor"
sleep 1
key Return
sleep 2
crop_window "^Piw$" "document-$THEME"

# A narrow window.
key ctrl+2
sleep 1
place_main "$NARROW" "$NARROW"
sleep 1
crop_window "^Piw$" "notes-narrow-$THEME"
key ctrl+3
sleep 1
crop_window "^Piw$" "tasks-narrow-$THEME"
place_main "$W" "$H"

# Quick capture (task, then note).
piw_cli --quick-task
wait_for_window "Quick Capture" 10
focus_window "Quick Capture"
type_text "Order a new keyboard"
sleep 0.6
crop_window "Quick Capture" "capture-task-$THEME"
key Escape
sleep 0.8
piw_cli --quick-note
wait_for_window "Quick Capture" 10
focus_window "Quick Capture"
sleep 0.6
crop_window "Quick Capture" "capture-note-$THEME"
key Escape
stop_piw
