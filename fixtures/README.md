# Fixtures

`vault/` is a small vault in [format 1](../docs/vault-format.md), and `vault.expected.json` is
what reading it must produce: each note's space, title, tags, resolved links and tasks (1-based
line numbers). The Rust indexer and the TypeScript parser are both tested against this file, so
the two never disagree.

- `Personal/Edge cases.md` covers the corners of the task rules. Each line says whether it is a
  task.
- `.config/` and `Personal/todo.txt` must be ignored (`ignored`).
- `task-edits.json` lists how a task line changes when it is ticked, dated or reworded.
- Line endings: Git checks these files out with LF (`.gitattributes`). Tests derive the CRLF, BOM
  and no-final-newline variants from them in memory instead of committing them.

The files are compared byte for byte, so Prettier skips this folder. Change a fixture and its
expected output in the same commit.
