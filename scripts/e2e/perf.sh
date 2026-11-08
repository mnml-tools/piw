# Measurements for docs/architecture.md#validation (release build, nested KWin session, scale 1).
. "$ROOT/scripts/e2e/lib.sh"

now_ms() { date +%s%3N; }

# Proportional set size (KiB) of Piw and its WebKit helper processes.
pss_total() {
  children="$(pgrep -P "$PIW_PID" || true)"
  grandchildren="$(for p in $children; do pgrep -P "$p" || true; done)"
  pids="$PIW_PID $children $grandchildren"
  total=0
  for pid in $(printf '%s\n' $pids | sort -u); do
    v=$(awk '/^Pss:/ {print $2}' "/proc/$pid/smaps_rollup" 2>/dev/null)
    total=$((total + ${v:-0}))
  done
  echo $((total / 1024))
}

t0=$(now_ms)
env -u GDK_BACKEND -u WAYLAND_DISPLAY "$PIW_BIN" >>"$OUT/piw.log" 2>&1 &
PIW_PID=$!
until grep -q "launch action" "$OUT/piw.log" 2>/dev/null; do sleep 0.01; done
t1=$(now_ms)
until xdo search --onlyvisible --name "^Piw$" >/dev/null 2>&1; do sleep 0.01; done
t2=$(now_ms)
echo "startup_setup_done_ms=$((t1 - t0))" >>"$OUT/result.txt"
echo "startup_workspace_window_mapped_ms=$((t2 - t0))" >>"$OUT/result.txt"
sleep 4
echo "pss_workspace_plus_hidden_capture_mib=$(pss_total)" >>"$OUT/result.txt"

# Capture latency via the CLI fallback (spawns a second process; the global shortcut is faster).
for i in 1 2 3; do
  t0=$(now_ms)
  piw_cli --quick-note
  until xdo search --onlyvisible --name "Quick Capture" >/dev/null 2>&1; do sleep 0.01; done
  t1=$(now_ms)
  echo "capture_visible_after_cli_ms_run$i=$((t1 - t0))" >>"$OUT/result.txt"
  key Escape
  sleep 1
done
stop_piw
sleep 2

# Five pinned stickies restored at launch.
python3 - "$PIW_DATA_DIR/piw.sqlite3" <<'PY'
import sqlite3, sys, uuid
db = sqlite3.connect(sys.argv[1])
space = db.execute("SELECT id FROM spaces WHERE is_default = 1").fetchone()[0]
ts = "2026-11-06T12:00:00.000Z"
for i in range(5):
    tid = str(uuid.uuid4())
    db.execute("INSERT INTO tasks (id, space_id, title, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", (tid, space, f"Sticky {i}", i, ts, ts))
    db.execute("INSERT INTO sticky_windows (target_kind, target_id, x, y, width, height, is_open, created_at, updated_at) VALUES ('task', ?, ?, ?, 300, 200, 1, ?, ?)", (tid, 100 + i * 60, 100 + i * 60, ts, ts))
db.execute("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('restoreStickiesOnLaunch', 'true', ?)", (ts,))
db.commit()
PY
start_piw --hidden
sleep 6
echo "pss_with_5_stickies_mib=$(pss_total)" >>"$OUT/result.txt"
echo "processes=$(pgrep -P "$PIW_PID" | wc -l) direct children" >>"$OUT/result.txt"
shot five-stickies
stop_piw
