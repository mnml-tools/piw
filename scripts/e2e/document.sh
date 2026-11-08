# Scenario CA-03/CA-04/CA-05: a document with a real task created from a content tab line is
# one task row, visible in Tasks with its document; an editorial checklist is not a task.
. "$ROOT/scripts/e2e/lib.sh"

start_piw
wait_for_window "^Piw$" 20
focus_window "^Piw$"
sleep 1

# New document (Mod+Shift+N): explicit title, one content tab.
key ctrl+shift+n
sleep 0.8
type_text "Refactor 2FA"
key Return
sleep 1.5
assert_sql "document created with one tab" "SELECT title || ':' || (SELECT count(*) FROM document_tabs) FROM notes WHERE kind = 'document'" "Refactor 2FA:1"

# A new document opens with the caret in its first tab.
# CA-05: an editorial checklist (Markdown input rule) is content, not a task.
type_text "[ ] Read RFC 6238"
key Return Return
type_text "Adicionar testes unitarios"
sleep 0.3
# CA-04: Mod+T turns the caret's line into a real task linked to the document.
key ctrl+t
sleep 1.5
shot 01-document-with-task
assert_sql "exactly one real task, linked to the document" \
  "SELECT count(*) || ':' || (t.document_id = d.id) FROM tasks t, notes d WHERE d.kind = 'document'" "1:1"
assert_sql "the task is the converted line" "SELECT title FROM tasks" "Adicionar testes unitarios"
sleep 2
assert_sql "the tab references the task by id only" \
  "SELECT instr(content_json, (SELECT id FROM tasks)) > 0 AND instr(content_json, 'Adicionar testes') = 0 FROM document_tabs" "1"
assert_sql "the checklist stayed editorial" "SELECT instr(content_json, 'checklist') > 0 FROM document_tabs" "1"

# The same task appears in Tasks with its document name.
key ctrl+3
sleep 1.5
shot 02-tasks-with-document
stop_piw
