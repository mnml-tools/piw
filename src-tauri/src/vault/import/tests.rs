//! The import on a small database of Piw 0.1, built with plain SQL as 0.1 stored it.

use std::fs;

use super::{finish, import, pending};
use crate::storage::Database;
use crate::vault::Vault;

const OLD: &str = r#"
INSERT INTO spaces (id, name, sort_order, is_default, created_at, updated_at) VALUES
    ('s1', 'Work', 0, 1, 't', 't'), ('s2', 'Personal: home', 1, 0, 't', 't');
INSERT INTO tags (id, name, created_at) VALUES ('g1', 'calls', 't'), ('g2', 'auth', 't'), ('g3', 'home', 't');
INSERT INTO notes (id, space_id, kind, title, body, created_at, updated_at) VALUES
    ('n1', 's1', 'quick_note', '', 'Supplier call
Ask about [prices]', '2026-01-01', 't');
INSERT INTO notes (id, space_id, kind, title, body, created_at, updated_at, archived_at) VALUES
    ('n2', 's2', 'quick_note', 'Old idea', 'Old idea', '2026-01-02', 't', 't');
INSERT INTO notes (id, space_id, kind, title, body, created_at, updated_at, deleted_at) VALUES
    ('n3', 's1', 'quick_note', 'Trashed', 'gone', '2026-01-03', 't', 't');
INSERT INTO notes (id, space_id, kind, title, sidebar_order, created_at, updated_at) VALUES
    ('d1', 's1', 'document', 'Refactor 2FA', 0, '2026-01-04', 't');
INSERT INTO note_tags (note_id, tag_id) VALUES ('n1', 'g1'), ('d1', 'g2');
INSERT INTO document_tabs (id, document_id, kind, title, sort_order, content_json, plain_text, created_at, updated_at) VALUES
    ('t1', 'd1', 'content', 'Overview', 0,
     '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Plan"}]},{"type":"paragraph","content":[{"type":"taskRef","attrs":{"taskId":"k1"}}]},{"type":"paragraph","content":[{"type":"text","text":"Then "},{"type":"taskRef","attrs":{"taskId":"k4"}}]}]}',
     'Plan', 't', 't'),
    ('t2', 'd1', 'tasks', 'To-dos', 1, NULL, '', 't', 't');
INSERT INTO task_sections (id, space_id, title, document_id, sort_order, created_at, updated_at) VALUES
    ('sec1', 's1', 'Atlas', 'd1', 0, 't', 't');
INSERT INTO tasks (id, space_id, document_id, parent_task_id, section_id, title, description, status, due_date, completed_at, sort_order, created_at, updated_at, deleted_at) VALUES
    ('k1', 's1', 'd1', NULL, NULL, 'Agree on the window', '', 'open', '2026-11-12', NULL, 0, 't', 't', NULL),
    ('k1a', 's1', 'd1', 'k1', NULL, 'Read RFC', '', 'completed', NULL, '2026-11-08T10:00:00.000Z', 0, 't', 't', NULL),
    ('k2', 's1', 'd1', NULL, NULL, 'Review with the team', '', 'open', NULL, NULL, 1, 't', 't', NULL),
    ('k3', 's1', 'd1', NULL, NULL, 'In the trash', '', 'open', NULL, NULL, 2, 't', 't', 't'),
    ('k4', 's1', NULL, NULL, 'sec1', 'Ship atlas', 'line one
line two', 'open', NULL, NULL, 3, 't', 't', NULL),
    ('k5', 's1', NULL, NULL, NULL, 'Call the bank', '', 'open', NULL, NULL, 4, 't', 't', NULL),
    ('k6', 's2', NULL, NULL, NULL, 'Water the plants', '', 'completed', NULL, '2026-11-09T08:00:00.000Z', 5, 't', 't', NULL);
INSERT INTO task_tags (task_id, tag_id) VALUES ('k6', 'g3');
INSERT INTO sticky_windows (target_kind, target_id, x, y, width, height, color, created_at, updated_at) VALUES
    ('note', 'n1', 10, 20, 300, 260, 'mint', 't', 't'),
    ('task', 'k4', NULL, NULL, 300, 260, NULL, 't', 't'),
    ('tasks_tab', 't2', NULL, NULL, 300, 260, NULL, 't', 't'),
    ('note', 'n3', NULL, NULL, 300, 260, NULL, 't', 't');
"#;

#[test]
fn piw_0_1_moves_into_the_vault_without_losing_a_task() {
    let db = Database::open_in_memory().unwrap();
    db.read(|c| Ok(c.execute_batch(OLD)?)).unwrap();
    assert!(db.read(pending).unwrap());

    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::open(&dir.path().join("vault"), &dir.path().join("data")).unwrap();
    let imported = db.read(|c| import(c, &vault)).unwrap();
    let root = vault.root().to_string_lossy().into_owned();
    db.write(|tx| finish(tx, &root, &imported.stickies))
        .unwrap();
    let report = &imported.report;
    assert_eq!(
        (
            report.notes,
            report.documents,
            report.sections,
            report.tasks
        ),
        (2, 1, 1, 6)
    );

    let read = |path: &str| fs::read_to_string(vault.root().join(path)).unwrap();
    assert_eq!(
        read("Work/Supplier call.md"),
        "---\ntags: [calls]\n---\n\nSupplier call\nAsk about [prices]\n"
    );
    assert_eq!(read("Personal- home/Archive/Old idea.md"), "Old idea\n");
    assert_eq!(
        read("Work/Refactor 2FA.md"),
        "---\ntags: [auth]\n---\n\n## Overview\n\n# Plan\n\n\
         - [ ] Agree on the window 📅 2026-11-12\n  - [x] Read RFC ✅ 2026-11-08\n\n\
         Then Ship atlas\n\n## To-dos\n\n- [ ] Review with the team\n"
    );
    assert_eq!(
        read("Work/Atlas.md"),
        "See [[Refactor 2FA]].\n\n- [ ] Ship atlas\n  line one\n  line two\n"
    );
    assert_eq!(read("Work/Inbox.md"), "- [ ] Call the bank\n");
    assert_eq!(
        read("Personal- home/Inbox.md"),
        "- [x] Water the plants #home ✅ 2026-11-09\n"
    );
    assert!(!vault.root().join("Work/Trashed.md").exists());

    // Every live task of 0.1 is one task in the vault, and nothing else is.
    vault.sync().unwrap();
    let in_vault: usize = vault
        .index()
        .notes()
        .unwrap()
        .iter()
        .map(|n| (n.tasks_open + n.tasks_done) as usize)
        .sum();
    assert_eq!(in_vault, 6);

    // Stickies follow their item; the rest are forgotten; the import is done.
    let moved: Vec<(String, String, i64, Option<String>)> = db
        .read(|c| {
            let mut stmt = c.prepare(
                "SELECT s.target_kind, v.path, coalesce(s.x, -1), s.color FROM sticky_windows s
                 JOIN vault_stickies v USING (target_kind, target_id) ORDER BY v.path",
            )?;
            Ok(stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
                .collect::<Result<_, _>>()?)
        })
        .unwrap();
    assert_eq!(
        moved,
        vec![
            ("vault_note".into(), "Work/Atlas.md".into(), -1, None),
            ("vault_note".into(), "Work/Refactor 2FA.md".into(), -1, None),
            (
                "vault_note".into(),
                "Work/Supplier call.md".into(),
                10,
                Some("mint".into())
            ),
        ]
    );
    let old: i64 = db
        .read(|c| {
            Ok(c.query_row(
                "SELECT count(*) FROM sticky_windows WHERE target_kind NOT LIKE 'vault_%'",
                [],
                |r| r.get(0),
            )?)
        })
        .unwrap();
    assert_eq!(old, 0);
    assert!(!db.read(pending).unwrap());
    // The old rows themselves are kept.
    let kept: i64 = db
        .read(|c| Ok(c.query_row("SELECT count(*) FROM tasks", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(kept, 7);
}

#[test]
fn importing_into_a_vault_with_notes_never_overwrites_them() {
    let db = Database::open_in_memory().unwrap();
    db.read(|c| Ok(c.execute_batch(OLD)?)).unwrap();
    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::open(&dir.path().join("vault"), &dir.path().join("data")).unwrap();
    vault.create_folder(None, "Work").ok();
    fs::write(vault.root().join("Work/Inbox.md"), "Mine\n").unwrap();
    fs::write(vault.root().join("Work/Atlas.md"), "Also mine\n").unwrap();
    vault.sync().unwrap();
    db.read(|c| import(c, &vault)).unwrap();
    let read = |path: &str| fs::read_to_string(vault.root().join(path)).unwrap();
    assert_eq!(read("Work/Atlas.md"), "Also mine\n");
    assert!(read("Work/Atlas 2.md").contains("Ship atlas"));
    assert_eq!(read("Work/Inbox.md"), "Mine\n\n- [ ] Call the bank\n");
}

/// A real database: `PIW_IMPORT_DB=/copy/of/piw.sqlite3 cargo test -- --ignored real_database
/// --nocapture`. Work on a copy: opening it runs the migrations.
#[test]
#[ignore = "needs PIW_IMPORT_DB"]
fn real_database_keeps_every_note_and_task() {
    let path = std::env::var("PIW_IMPORT_DB").expect("PIW_IMPORT_DB");
    let db = Database::open(std::path::Path::new(&path)).unwrap();
    let count = |sql: &str| {
        db.read(|c| Ok(c.query_row(sql, [], |r| r.get::<_, i64>(0))?))
            .unwrap()
    };
    let notes =
        count("SELECT count(*) FROM notes WHERE deleted_at IS NULL AND kind = 'quick_note'");
    let documents =
        count("SELECT count(*) FROM notes WHERE deleted_at IS NULL AND kind = 'document'");
    let sections = count("SELECT count(*) FROM task_sections WHERE deleted_at IS NULL");
    let tasks = count("SELECT count(*) FROM tasks WHERE deleted_at IS NULL");

    let dir = tempfile::tempdir().unwrap();
    let vault = Vault::open(&dir.path().join("vault"), &dir.path().join("data")).unwrap();
    let imported = db.read(|c| import(c, &vault)).unwrap();
    let report = &imported.report;
    println!("database: {notes} notes, {documents} documents, {sections} sections, {tasks} tasks");
    println!(
        "vault: {} notes, {} documents, {} sections, {} tasks, {} files",
        report.notes,
        report.documents,
        report.sections,
        report.tasks,
        report.files.len()
    );
    vault.sync().unwrap();
    let in_vault: usize = vault
        .index()
        .notes()
        .unwrap()
        .iter()
        .map(|n| (n.tasks_open + n.tasks_done) as usize)
        .sum();
    println!("index: {in_vault} tasks");
    assert_eq!(
        (
            report.notes,
            report.documents,
            report.sections,
            report.tasks
        ),
        (
            notes as usize,
            documents as usize,
            sections as usize,
            tasks as usize
        )
    );
    // Checklists already in notes and documents are tasks in the vault too.
    assert!(in_vault >= tasks as usize);
}
