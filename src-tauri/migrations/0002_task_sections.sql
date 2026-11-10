-- Task sections (docs/ui-design-system.md §10): named groups of top-level tasks inside one space,
-- e.g. the projects of "Work". A task belongs to at most one section; subtasks follow their
-- parent and never carry one. Deleting a section is soft: its tasks show under "No section"
-- until the section is restored (Undo).
CREATE TABLE task_sections (
    id           TEXT PRIMARY KEY NOT NULL,
    space_id     TEXT NOT NULL REFERENCES spaces (id) ON DELETE RESTRICT,
    title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
    -- Optional link to the project's document (opened from the section header).
    document_id  TEXT REFERENCES notes (id) ON DELETE SET NULL,
    sort_order   INTEGER NOT NULL,
    collapsed    INTEGER NOT NULL DEFAULT 0 CHECK (collapsed IN (0, 1)),
    rev          INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT
);
CREATE INDEX task_sections_space ON task_sections (space_id, sort_order);

CREATE TRIGGER task_sections_document_must_be_document
BEFORE INSERT ON task_sections
WHEN NEW.document_id IS NOT NULL
 AND (SELECT kind FROM notes WHERE id = NEW.document_id) IS NOT 'document'
BEGIN
    SELECT RAISE(ABORT, 'document_id must reference a document');
END;

CREATE TRIGGER task_sections_document_must_be_document_update
BEFORE UPDATE OF document_id ON task_sections
WHEN NEW.document_id IS NOT NULL
 AND (SELECT kind FROM notes WHERE id = NEW.document_id) IS NOT 'document'
BEGIN
    SELECT RAISE(ABORT, 'document_id must reference a document');
END;

ALTER TABLE tasks ADD COLUMN section_id TEXT REFERENCES task_sections (id) ON DELETE SET NULL;
CREATE INDEX tasks_section ON tasks (section_id, sort_order) WHERE section_id IS NOT NULL;

-- A task and its section always share a space.
CREATE TRIGGER tasks_section_same_space
BEFORE INSERT ON tasks
WHEN NEW.section_id IS NOT NULL
 AND (SELECT space_id FROM task_sections WHERE id = NEW.section_id) IS NOT NEW.space_id
BEGIN
    SELECT RAISE(ABORT, 'a task and its section must share a space');
END;

CREATE TRIGGER tasks_section_same_space_update
BEFORE UPDATE OF section_id ON tasks
WHEN NEW.section_id IS NOT NULL
 AND (SELECT space_id FROM task_sections WHERE id = NEW.section_id) IS NOT NEW.space_id
BEGIN
    SELECT RAISE(ABORT, 'a task and its section must share a space');
END;

-- A task that moves to another space (directly, with its document, ...) leaves its section.
CREATE TRIGGER tasks_leave_section_on_space_move
AFTER UPDATE OF space_id ON tasks
WHEN NEW.section_id IS NOT NULL
 AND (SELECT space_id FROM task_sections WHERE id = NEW.section_id) IS NOT NEW.space_id
BEGIN
    UPDATE tasks SET section_id = NULL WHERE id = NEW.id;
END;

-- Sections can be pinned to the desktop: rebuild sticky_windows to accept the new kind (SQLite
-- cannot alter a CHECK). The cleanup triggers name the table, so they are recreated around it.
DROP TRIGGER sticky_cleanup_note;
DROP TRIGGER sticky_cleanup_task;
DROP TRIGGER sticky_cleanup_tab;

CREATE TABLE sticky_windows_new (
    target_kind    TEXT NOT NULL CHECK (target_kind IN ('note', 'task', 'tasks_tab', 'section')),
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
