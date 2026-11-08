# Scale diagnosis: the same workspace with Xft.dpi 96 / 134 and Piw's UI zoom on / off.
. "$ROOT/scripts/e2e/lib.sh"

run_case() { # <name> <xft-dpi> <PIW_UI_SCALE or empty>
  printf 'Xft.dpi: %s\n' "$2" | env -u WAYLAND_DISPLAY xrdb -merge
  if [ -n "$3" ]; then export PIW_UI_SCALE="$3"; else unset PIW_UI_SCALE; fi
  start_piw
  wait_for_window "^Piw$" 20
  focus_window "^Piw$"
  key ctrl+3
  sleep 1.5
  id="$(xdo search --onlyvisible --name "^Piw$" | head -1)"
  eval "$(xdo getwindowgeometry --shell "$id")"
  shot "_full"
  magick "$OUT/_full.png" -crop "${WIDTH}x${HEIGHT}+${X}+${Y}" +repage "$OUT/$1.png"
  echo "$1 window=${WIDTH}x${HEIGHT}" >>"$OUT/result.txt"
  grep -i "ui scale\|zoom" "$OUT/piw.log" | tail -1 >>"$OUT/result.txt"
  stop_piw
  sleep 2
}

start_piw --hidden
stop_piw
sleep 2
python3 "$ROOT/scripts/e2e/seed-demo.py" "$PIW_DATA_DIR/piw.sqlite3" light >/dev/null
run_case dpi96 96 ""
run_case dpi134-zoom 134 ""
run_case dpi134-nozoom 134 "1"
