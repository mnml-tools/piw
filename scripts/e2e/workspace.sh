# Scenario: workspace basics (CA-02, CA-03, CA-04, CA-10) with screenshots for visual review.
. "$ROOT/scripts/e2e/lib.sh"

start_piw
wait_for_window "^Piw$" 20
focus_window "^Piw$"
sleep 1
shot 01-inbox-empty

# CA-02: a quick task with no metadata, from the keyboard (Mod+T focuses "Add task").
key ctrl+t
sleep 0.8
type_text "Comprar cafe"
key Return
sleep 1
shot 02-tasks-added
assert_sql "CA-02 task created" "SELECT title FROM tasks" "Comprar cafe"

# Notes: a new note from Mod+N; the record appears on the first character.
key ctrl+n
sleep 0.8
type_text "Refactor 2FA"
key Return
type_text "Move TOTP verification to the auth service."
sleep 1.5
shot 03-note-editor
assert_sql "note created on first character" "SELECT count(*) FROM notes WHERE kind = 'quick_note'" "1"

key ctrl+2
sleep 1
shot 04-notes-list
key ctrl+3
sleep 1
shot 05-tasks-all
key ctrl+1
sleep 1
shot 06-inbox

# Search palette (CA-09).
key ctrl+k
sleep 0.6
type_text "2FA"
sleep 1
shot 07-search
key Escape
stop_piw
