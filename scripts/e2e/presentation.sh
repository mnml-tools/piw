# Presentation screenshots: the rich demo workspace, every view, at 2x (crisp on slides).
# THEME=light|dark. Run with a large virtual output, e.g.:
#   E2E_WIDTH=3000 E2E_HEIGHT=1900 THEME=light scripts/e2e/nested-session.sh \
#     scripts/e2e/presentation.sh target-e2e/presentation-light
. "$ROOT/scripts/e2e/lib.sh"
THEME="${THEME:-light}"
DPI=192 # 2x: WebKitGTK renders CSS px at 2 device px
W=2880  # 1440 x 900 CSS px
H=1800

set_dpi() { printf 'Xft.dpi: %s\n' "$DPI" | env -u WAYLAND_DISPLAY xrdb -merge; }

crop_window() {
  id="$(xdo search --onlyvisible --name "$1" | head -1)"
  eval "$(xdo getwindowgeometry --shell "$id")"
  shot "_full"
  magick "$OUT/_full.png" -crop "${WIDTH}x${HEIGHT}+${X}+${Y}" +repage "$OUT/$2.png"
  rm -f "$OUT/_full.png"
}

place_main() {
  id="$(xdo search --onlyvisible --name "^Piw$" | head -1)"
  xdo windowsize --sync "$id" "$W" "$H" 2>/dev/null || xdo windowsize "$id" "$W" "$H"
  xdo windowmove --sync "$id" 40 40 2>/dev/null || xdo windowmove "$id" 40 40
  sleep 1.5
}

search_open() { # search_open <query>: opens the first result
  key ctrl+k
  sleep 0.7
  type_text "$1"
  sleep 1.2
  key Return
  sleep 2
}

set_dpi
start_piw --hidden
stop_piw
sleep 2
python3 "$ROOT/scripts/seed-rich.py" "$PIW_DATA_DIR/piw.sqlite3" "$THEME" >/dev/null

set_dpi
start_piw
wait_for_window "^Piw$" 20
place_main
focus_window "^Piw$"

key ctrl+1; sleep 1.5; crop_window "^Piw$" "01-inbox"
key ctrl+2; sleep 1.5; crop_window "^Piw$" "02-notes"
search_open "Design principles"; crop_window "^Piw$" "03-note-open"
key ctrl+3; sleep 1.5; crop_window "^Piw$" "04-tasks"
search_open "Migrate the remaining"; crop_window "^Piw$" "05-task-details"
key Escape; sleep 0.6
search_open "Refactor 2FA"; crop_window "^Piw$" "06-document"
search_open "Roadmap"; crop_window "^Piw$" "07-document-roadmap"
key ctrl+k; sleep 0.7; type_text "re"; sleep 1.5; crop_window "^Piw$" "08-search"
key Escape; sleep 0.6
key ctrl+4; sleep 1.5; crop_window "^Piw$" "09-pinned"
key ctrl+comma; sleep 1.5; crop_window "^Piw$" "10-settings"

# Quick Capture over the workspace (the backdrop is the Tasks view).
key ctrl+3; sleep 1.5
crop_window "^Piw$" "_backdrop"
piw_cli --quick-task
wait_for_window "Quick Capture" 10
focus_window "Quick Capture"
type_text "Order a new keyboard"
key Tab
type_text "Low-profile, quiet switches. Check the return policy first."
sleep 0.8
crop_window "Quick Capture" "_capture"
key Escape
sleep 0.8
stop_piw
sleep 2

# Stickies on the desktop, restored at launch next to each other.
python3 - "$PIW_DATA_DIR/piw.sqlite3" <<'PY'
import sqlite3, sys
db = sqlite3.connect(sys.argv[1])
rows = db.execute("SELECT target_kind, target_id FROM sticky_windows ORDER BY target_kind").fetchall()
for i, (kind, target) in enumerate(rows):
    db.execute("UPDATE sticky_windows SET is_open = 1, always_on_top = 1, x = ?, y = ?, width = 300,"
               " height = 280 WHERE target_kind = ? AND target_id = ?", (120 + i * 700, 200, kind, target))
db.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('restoreStickiesOnLaunch', 'true', '2026-11-07T00:00:00.000Z')")
db.commit()
PY
set_dpi
start_piw --hidden
wait_for_window "Piw sticky" 15
sleep 2.5
shot "_stickies-full"
i=0
for sid in $(xdo search --onlyvisible --name "Piw sticky"); do
  i=$((i + 1))
  eval "$(xdo getwindowgeometry --shell "$sid")"
  magick "$OUT/_stickies-full.png" -crop "${WIDTH}x${HEIGHT}+${X}+${Y}" +repage "$OUT/_sticky-$i.png"
done
stop_piw
