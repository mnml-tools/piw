# README screenshots from the real build: the demo vault (PIW_DEMO=1, src-tauri/src/vault/demo.rs)
# with a few notes open in tabs, the note panel and two stickies on top, as a 1440 x 900 window.
# It renders at 2x (Xft.dpi 192) and scales the picture down, as text on a HiDPI screen looks;
# at 1x the nested session draws the system font heavier than a desktop does. THEME=light|dark.
#   E2E_WIDTH=3200 E2E_HEIGHT=2000 THEME=light SHOT_VAULT=~/Piw-demo \
#     scripts/e2e/nested-session.sh scripts/e2e/presentation.sh target-e2e/presentation-light
# then copy $OUT/piw-screenshot-$THEME.png to docs/. SHOT_VAULT puts the vault where the status
# bar shows a short path; it must not exist yet, and is yours to delete afterwards.
. "$ROOT/scripts/e2e/lib.sh"
THEME="${THEME:-light}"
S=2    # device pixels per CSS px
W=1440 # the window, in CSS px
H=900
MX=40 # where it sits, in device px
MY=40
CORNER="3199 1999" # a point no window covers (the output is E2E_WIDTH x E2E_HEIGHT)
export PIW_DEMO=1
if [ -n "${SHOT_VAULT:-}" ]; then
  [ -e "$SHOT_VAULT" ] && { echo "SHOT_VAULT $SHOT_VAULT exists: pick a new folder" >&2; exit 2; }
  export PIW_VAULT="$SHOT_VAULT"
fi
px() { echo $(($1 * S)); }
set_dpi() { printf 'Xft.dpi: %s\n' $((96 * S)) | env -u WAYLAND_DISPLAY xrdb -merge; }

# First start: writes the demo vault and pins its two stickies. Then the theme and the blue
# accent, in Piw's data.
set_dpi
start_piw --hidden
wait_for_window "Piw sticky" 20 || true
sleep 2
stop_piw
sleep 2
python3 - "$PIW_DATA_DIR/piw.sqlite3" "$THEME" <<'PY'
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
for key, value in (("theme", sys.argv[2]), ("accent", "blue")):
    db.execute(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, '2026-11-10T00:00:00.000Z')",
        (key, json.dumps(value)),
    )
db.commit()
PY

# Second start: the workspace, with the stickies restored at launch.
# shellcheck disable=SC2086
xdo mousemove $CORNER
set_dpi
start_piw
wait_for_window "^Piw$" 20
main="$(xdo search --onlyvisible --name "^Piw$" | head -1)"
xdo windowsize --sync "$main" "$(px $W)" "$(px $H)" 2>/dev/null || xdo windowsize "$main" "$(px $W)" "$(px $H)"
xdo windowmove --sync "$main" "$MX" "$MY" 2>/dev/null || xdo windowmove "$main" "$MX" "$MY"
sleep 1.5
focus_window "^Piw$"

# A few notes in tabs (each opens after the active one, and its folder opens in the tree); the
# last one stays in front.
for note in "Refactor 2FA" "Weekly sync" "Design principles" "Trip to Lisbon" "Website launch"; do
  key ctrl+k
  sleep 0.8
  type_text "$note"
  sleep 1.2
  key Return
  sleep 1.5
done
sleep 1

# The stickies at the right of the note, one right under the other, above the code block. The
# demo note's long lines break before them (fixtures/demo).
SX=$((MX + $(px $((W - 260 - 360)))))
i=0
for sid in $(xdo search --onlyvisible --name "Piw sticky"); do
  xdo windowsize "$sid" "$(px 340)" "$(px $((230 - i * 50)))" 2>/dev/null || true
  xdo windowmove "$sid" "$SX" $((MY + $(px $((150 + i * 240)))))
  xdo windowraise "$sid"
  i=$((i + 1))
done
sleep 1.5

# WebKitGTK can keep a row hovered after the windows move: sweep the pointer down the stickies
# in small steps and out to the corner, so every row gets its leave event.
for y in $(seq $((MY + $(px 160))) 24 $((MY + $(px 860)))); do
  xdo mousemove $((SX + $(px 40))) "$y"
done
for x in $(seq $((SX + $(px 40))) 24 $((MX + $(px $W) + 100))); do
  xdo mousemove "$x" $((MY + $(px 860)))
done
# shellcheck disable=SC2086
xdo mousemove $CORNER
sleep 1.5

shot "_full"
magick "$OUT/_full.png" -crop "$(px $W)x$(px $H)+${MX}+${MY}" +repage \
  -filter Lanczos -resize "${W}x${H}" "$OUT/piw-screenshot-$THEME.png"
echo "screenshot: $OUT/piw-screenshot-$THEME.png"
stop_piw
