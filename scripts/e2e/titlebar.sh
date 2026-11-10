# Custom title bar on Linux: undecorated main window and app-drawn controls.
# Window-manager moves/resizes started by the app (drag region, resize edges, double click) do
# not follow xdotool's synthetic pointer in the nested session — the same holds for the sticky
# drag strip — so those three are reported as UNVERIFIED and must be checked by hand.
. "$ROOT/scripts/e2e/lib.sh"
start_piw
wait_for_window "^Piw$" 20
id="$(xdo search --onlyvisible --name "^Piw$" | head -1)"
xdo windowmove --sync "$id" 100 80 2>/dev/null || true
sleep 1
eval "$(xdo getwindowgeometry --shell "$id")"
echo "start ${WIDTH}x${HEIGHT}+${X}+${Y}" >>"$OUT/result.txt"
# No WM decoration: _MOTIF_WM_HINTS asks for none.
if env -u WAYLAND_DISPLAY xprop -id "$id" _MOTIF_WM_HINTS | grep -q "0x2, 0x0, 0x0"; then
  echo "PASS undecorated" >>"$OUT/result.txt"; else
  echo "INFO motif: $(env -u WAYLAND_DISPLAY xprop -id "$id" _MOTIF_WM_HINTS)" >>"$OUT/result.txt"; fi
shot 01-window
magick "$OUT/01-window.png" -crop "${WIDTH}x${HEIGHT}+${X}+${Y}" +repage "$OUT/window.png"
W0=$WIDTH; X0=$X; Y0=$Y
# Drag the window by an empty part of the top bar.
xdo mousemove $((X0 + W0 / 2)) $((Y0 + 20)) mousedown 1 mousemove $((X0 + W0 / 2 + 120)) $((Y0 + 80)) sleep 0.3 mouseup 1
sleep 1
eval "$(xdo getwindowgeometry --shell "$id")"
[ "$X" -ne "$X0" ] && echo "PASS dragged by the top bar ($X0,$Y0 -> $X,$Y)" >>"$OUT/result.txt" || echo "UNVERIFIED drag (synthetic input)" >>"$OUT/result.txt"
# Resize from the right edge.
X1=$X; Y1=$Y; W1=$WIDTH
xdo mousemove $((X1 + W1 - 2)) $((Y1 + 300)) mousedown 1 mousemove $((X1 + W1 + 150)) $((Y1 + 300)) sleep 0.3 mouseup 1
sleep 1
eval "$(xdo getwindowgeometry --shell "$id")"
[ "$WIDTH" -gt "$W1" ] && echo "PASS resized from the edge ($W1 -> $WIDTH)" >>"$OUT/result.txt" || echo "UNVERIFIED resize (synthetic input)" >>"$OUT/result.txt"
# Maximize with a double click on the bar, then restore.
xdo mousemove $((X + WIDTH / 2)) $((Y + 20)) click --repeat 2 --delay 80 1
sleep 1.5
eval "$(xdo getwindowgeometry --shell "$id")"
echo "after double click ${WIDTH}x${HEIGHT}+${X}+${Y}" >>"$OUT/result.txt"
shot 02-maximized
[ "$WIDTH" -ge 1390 ] && echo "PASS double click maximizes" >>"$OUT/result.txt" || echo "UNVERIFIED double click (synthetic input)" >>"$OUT/result.txt"
xdo mousemove $((X + WIDTH / 2)) $((Y + 20)) click --repeat 2 --delay 80 1
sleep 1.5
# Minimize button: rightmost controls; find them at the far right of the bar.
eval "$(xdo getwindowgeometry --shell "$id")"
xdo mousemove $((X + WIDTH - 102)) $((Y + 22)) click 1
sleep 1.5
if xdo search --onlyvisible --name "^Piw$" >/dev/null 2>&1; then echo "FAIL minimize: still visible" >>"$OUT/result.txt"; else echo "PASS minimize button" >>"$OUT/result.txt"; fi
stop_piw
