# Scenario CA-06: a pinned task reopens at launch only when enabled, shows the real task, and
# Mod+W hides it without unpinning (state persisted).
. "$ROOT/scripts/e2e/lib.sh"

# First launch creates the database; quit, then seed a pinned task directly (setup only).
start_piw --hidden
stop_piw
sleep 2
python3 - "$PIW_DATA_DIR/piw.sqlite3" <<'PY'
import sqlite3, sys, uuid
db = sqlite3.connect(sys.argv[1])
space = db.execute("SELECT id FROM spaces WHERE is_default = 1").fetchone()[0]
task = str(uuid.uuid4())
ts = "2026-11-06T12:00:00.000Z"
db.execute("INSERT INTO tasks (id, space_id, title, description, sort_order, created_at, updated_at) VALUES (?, ?, 'Comprar cafe', 'Grao, nao moido', 0, ?, ?)", (task, space, ts, ts))
db.execute("INSERT INTO tasks (id, space_id, parent_task_id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, 'Ver precos', 0, ?, ?)", (str(uuid.uuid4()), space, task, ts, ts))
db.execute("INSERT INTO sticky_windows (target_kind, target_id, x, y, width, height, always_on_top, color, is_open, created_at, updated_at) VALUES ('task', ?, 900, 200, 300, 260, 1, 'yellow', 1, ?, ?)", (task, ts, ts))
db.execute("INSERT INTO settings (key, value, updated_at) VALUES ('restoreStickiesOnLaunch', 'true', ?)", (ts,))
db.commit()
PY

start_piw --hidden
wait_for_window "Piw sticky" 15
shot 01-sticky-restored
sid="$(xdo search --onlyvisible --name "Piw sticky" | head -1)"
echo "geometry: $(xdo getwindowgeometry "$sid" | tr '\n' ' ')" >>"$OUT/result.txt"
if env -u WAYLAND_DISPLAY xprop -id "$sid" _NET_WM_STATE | grep -q ABOVE; then
  echo "PASS sticky restored on top" >>"$OUT/result.txt"
else
  echo "FAIL sticky restored on top" >>"$OUT/result.txt"
fi

focus_window "Piw sticky"
key ctrl+w
sleep 1.5
assert_hidden "Piw sticky" "Mod+W hides the sticky"
assert_sql "hidden sticky stays pinned" "SELECT is_open FROM sticky_windows" "0"
stop_piw
