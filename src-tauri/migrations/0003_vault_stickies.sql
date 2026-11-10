-- Vault stickies (docs/redesign.md, phase 4): a sticky can show a vault note or a task view.
-- Its window state stays here, on this device; the vault only holds the notes. sticky_windows
-- is rebuilt to accept the two kinds (SQLite cannot alter a CHECK), with its cleanup triggers
-- recreated around it, as in 0002.
DROP TRIGGER sticky_cleanup_note;
DROP TRIGGER sticky_cleanup_task;
DROP TRIGGER sticky_cleanup_tab;
DROP TRIGGER sticky_cleanup_section;

CREATE TABLE sticky_windows_new (
    target_kind    TEXT NOT NULL CHECK (target_kind IN
                       ('note', 'task', 'tasks_tab', 'section', 'vault_note', 'vault_tasks')),
    target_id      TEXT NOT NULL,
    x              INTEGER,
    y              INTEGER,
    width          REAL NOT NULL CHECK (width > 0),
    height         REAL NOT NULL CHECK (height > 0),
    always_on_top  INTEGER NOT NULL DEFAULT 0 CHECK (always_on_top IN (0, 1)),
    color          TEXT CHECK (color IN ('yellow', 'peach', 'rose', 'mint', 'sky', 'lavender')),
    is_open        INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    PRIMARY KEY (target_kind, target_id)
) WITHOUT ROWID;
INSERT INTO sticky_windows_new SELECT * FROM sticky_windows;
DROP TABLE sticky_windows;
ALTER TABLE sticky_windows_new RENAME TO sticky_windows;

CREATE TRIGGER sticky_cleanup_note AFTER DELETE ON notes BEGIN
    DELETE FROM sticky_windows WHERE target_kind = 'note' AND target_id = OLD.id;
END;
CREATE TRIGGER sticky_cleanup_task AFTER DELETE ON tasks BEGIN
    DELETE FROM sticky_windows WHERE target_kind = 'task' AND target_id = OLD.id;
END;
CREATE TRIGGER sticky_cleanup_tab AFTER DELETE ON document_tabs BEGIN
    DELETE FROM sticky_windows WHERE target_kind = 'tasks_tab' AND target_id = OLD.id;
END;
CREATE TRIGGER sticky_cleanup_section AFTER DELETE ON task_sections BEGIN
    DELETE FROM sticky_windows WHERE target_kind = 'section' AND target_id = OLD.id;
END;

-- What a vault sticky shows: a note by its vault path (renames follow it) or a task view with
-- its space filter. A sticky id is not derived from the path, so a rename keeps the window.
CREATE TABLE vault_stickies (
    target_kind  TEXT NOT NULL CHECK (target_kind IN ('vault_note', 'vault_tasks')),
    target_id    TEXT NOT NULL,
    vault_root   TEXT NOT NULL,
    path         TEXT,
    view         TEXT CHECK (view IN ('today', 'upcoming', 'all')),
    space        TEXT,
    PRIMARY KEY (target_kind, target_id),
    CHECK ((target_kind = 'vault_note') = (path IS NOT NULL)),
    CHECK ((target_kind = 'vault_tasks') = (view IS NOT NULL))
) WITHOUT ROWID;
CREATE UNIQUE INDEX vault_stickies_note ON vault_stickies (vault_root, path)
    WHERE path IS NOT NULL;
CREATE UNIQUE INDEX vault_stickies_view ON vault_stickies (vault_root, view, coalesce(space, ''))
    WHERE view IS NOT NULL;

-- Removing a vault sticky forgets what it showed.
CREATE TRIGGER vault_sticky_cleanup AFTER DELETE ON sticky_windows
WHEN OLD.target_kind IN ('vault_note', 'vault_tasks')
BEGIN
    DELETE FROM vault_stickies WHERE target_kind = OLD.target_kind AND target_id = OLD.target_id;
END;
