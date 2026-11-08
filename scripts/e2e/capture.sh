# Scenario CA-01/CA-02/CA-08: Quick Capture saves a note and a task, closes only after saving,
# and keeps a draft when dismissed.
. "$ROOT/scripts/e2e/lib.sh"

start_piw --hidden

# Fallback entry point: a second instance forwards --quick-note to the running app.
piw_cli --quick-note
wait_for_window "Quick Capture" 10
focus_window "Quick Capture"
type_text "Ligar ao fornecedor"
shot 01-capture-note
key ctrl+Return
sleep 1.5
assert_hidden "Quick Capture" "capture closes after saving a note"
assert_sql "note persisted" "SELECT body FROM notes" "Ligar ao fornecedor"

piw_cli --quick-task
wait_for_window "Quick Capture" 10
focus_window "Quick Capture"
type_text "Comprar cafe"
key Tab
type_text "No supermercado"
shot 02-capture-task
key ctrl+Return
sleep 1.5
assert_sql "task persisted with description" "SELECT title || ' / ' || description FROM tasks" "Comprar cafe / No supermercado"

# Escape keeps a draft; reopening restores it.
piw_cli --quick-note
wait_for_window "Quick Capture" 10
focus_window "Quick Capture"
type_text "rascunho por acabar"
sleep 0.8
key Escape
sleep 1
assert_hidden "Quick Capture" "Escape closes the capture"
assert_sql "draft kept after Escape" "SELECT json_extract(content, '$.text') FROM capture_drafts" "rascunho por acabar"
piw_cli --quick-note
wait_for_window "Quick Capture" 10
sleep 1
shot 03-draft-restored
key Escape
assert_sql "last capture space remembered" "SELECT count(*) FROM settings WHERE key = 'lastCaptureSpaceId'" "1"
stop_piw
