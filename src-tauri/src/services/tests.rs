//! Integration tests of the services against a real (in-memory or file) SQLite database.
//! Scenario names refer to the acceptance criteria in plan.md §7.

use chrono::NaiveDate;
use serde_json::json;

use super::documents::{self, CreateDocument, LinkedTasks};
use super::notes::{self, CreateNote, NoteQuery, NoteScope, UpdateNoteText};
use super::tasks::{self, CreateTask, TaskQuery, TaskView, UpdateTaskText};
use super::test_support::{db, space_named};
use super::{drafts, inbox, search, settings, spaces, tags, trash};
use crate::domain::change::EntityKind;
use crate::domain::model::{InboxItem, NoteKind, TabKind, TaskStatus, TasksTabShow, TasksTabSort};
use crate::error::{AppError, ErrorCode};
use crate::storage::Database;

fn today() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 11, 6).unwrap()
}

fn quick_note(db: &Database, body: &str) -> String {
    db.write(|tx| {
        notes::create(
            tx,
            CreateNote {
                body: body.into(),
                ..Default::default()
            },
        )
    })
    .unwrap()
    .0
    .id
}

fn quick_task(db: &Database, title: &str) -> String {
    db.write(|tx| {
        tasks::create(
            tx,
            CreateTask {
                title: title.into(),
                ..Default::default()
            },
        )
    })
    .unwrap()
    .0
    .id
}

fn task_rows(db: &Database, title: &str) -> i64 {
    db.read(|c| {
        Ok(c.query_row(
            "SELECT count(*) FROM tasks WHERE title = ?1",
            [title],
            |r| r.get(0),
        )?)
    })
    .unwrap()
}

// ---------------------------------------------------------------- spaces

#[test]
fn seeds_work_and_personal_once() {
    let db = db();
    let list = db.read(spaces::list).unwrap();
    assert_eq!(
        list.iter().map(|s| s.name.as_str()).collect::<Vec<_>>(),
        ["Work", "Personal"]
    );
    assert!(list[0].is_default && !list[1].is_default);
    assert!(!db.write(spaces::ensure_seeded).unwrap());
}

#[test]
fn space_names_are_unique_ignoring_case() {
    let db = db();
    let error = db
        .write(|tx| spaces::create(tx, "  work ", None))
        .unwrap_err();
    assert_eq!(error.code(), ErrorCode::Validation);
}

#[test]
fn deleting_a_space_moves_its_items_and_the_default() {
    let db = db();
    let work = space_named(&db, "Work");
    let personal = space_named(&db, "Personal");
    let note = quick_note(&db, "keep me");
    let task = quick_task(&db, "keep me too");
    let changes = db.write(|tx| spaces::delete(tx, &work, &personal)).unwrap();
    assert!(changes.contains(EntityKind::Note, &note) && changes.contains(EntityKind::Task, &task));
    let remaining = db.read(spaces::list).unwrap();
    assert_eq!(remaining.len(), 1);
    assert!(remaining[0].is_default);
    assert_eq!(
        db.read(|c| notes::get(c, &note)).unwrap().space_id,
        personal
    );
    assert_eq!(
        db.read(|c| tasks::get(c, &task)).unwrap().space_id,
        personal
    );
    // The last space cannot be deleted (there is nowhere to move items).
    assert!(
        db.write(|tx| spaces::delete(tx, &personal, &personal))
            .is_err()
    );
}

// ---------------------------------------------------------------- notes

#[test]
fn ca01_quick_note_is_persisted_and_listed() {
    let db = db();
    let id = quick_note(&db, "Ligar ao fornecedor");
    let list = db.read(|c| notes::list(c, &NoteQuery::default())).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, id);
    assert_eq!(list[0].display_title, "Ligar ao fornecedor");
}

#[test]
fn empty_notes_are_never_created() {
    let db = db();
    let error = db
        .write(|tx| {
            notes::create(
                tx,
                CreateNote {
                    body: " \n\t".into(),
                    ..Default::default()
                },
            )
        })
        .unwrap_err();
    assert_eq!(error.code(), ErrorCode::Validation);
}

#[test]
fn unicode_emoji_and_long_text_round_trip() {
    let db = db();
    let body = format!(
        "Ação — café ☕ 🚀 日本語\n{}",
        "linha longa ".repeat(100_000)
    );
    let id = quick_note(&db, &body);
    let note = db.read(|c| notes::get(c, &id)).unwrap();
    assert_eq!(note.body.as_deref(), Some(body.as_str()));
    assert_eq!(note.display_title, "Ação — café ☕ 🚀 日本語");
}

#[test]
fn stale_saves_are_rejected_as_conflicts() {
    let db = db();
    let id = quick_note(&db, "v1");
    let saved = db
        .write(|tx| {
            notes::update_text(
                tx,
                &id,
                1,
                UpdateNoteText {
                    body: Some("v2".into()),
                    title: None,
                },
            )
        })
        .unwrap()
        .0;
    assert_eq!(saved.rev, 2);
    // A second window still holding rev 1 must not overwrite v2.
    let error = db
        .write(|tx| {
            notes::update_text(
                tx,
                &id,
                1,
                UpdateNoteText {
                    body: Some("stale".into()),
                    title: None,
                },
            )
        })
        .unwrap_err();
    assert_eq!(error.code(), ErrorCode::Conflict);
    assert_eq!(
        db.read(|c| notes::get(c, &id)).unwrap().body.as_deref(),
        Some("v2")
    );
}

#[test]
fn concurrent_writers_from_two_threads_cannot_both_win() {
    let db = std::sync::Arc::new(db());
    let id = quick_note(&db, "start");
    let handles: Vec<_> = (0..2)
        .map(|i| {
            let db = db.clone();
            let id = id.clone();
            std::thread::spawn(move || {
                db.write(|tx| {
                    notes::update_text(
                        tx,
                        &id,
                        1,
                        UpdateNoteText {
                            body: Some(format!("w{i}")),
                            title: None,
                        },
                    )
                })
                .map(|_| ())
            })
        })
        .collect();
    let results: Vec<_> = handles.into_iter().map(|h| h.join().unwrap()).collect();
    assert_eq!(results.iter().filter(|r| r.is_ok()).count(), 1);
    assert!(
        results
            .iter()
            .any(|r| matches!(r, Err(AppError::Conflict { .. })))
    );
}

#[test]
fn abandoned_empty_notes_are_discarded_but_real_ones_are_kept() {
    let db = db();
    let id = quick_note(&db, "x");
    db.write(|tx| {
        notes::update_text(
            tx,
            &id,
            1,
            UpdateNoteText {
                body: Some("   ".into()),
                title: None,
            },
        )
    })
    .unwrap();
    assert!(db.write(|tx| notes::discard_if_empty(tx, &id)).unwrap().0);
    let kept = quick_note(&db, "real text");
    assert!(!db.write(|tx| notes::discard_if_empty(tx, &kept)).unwrap().0);
    assert!(db.read(|c| notes::get(c, &kept)).is_ok());
}

#[test]
fn archive_trash_restore_and_purge() {
    let db = db();
    let id = quick_note(&db, "lifecycle");
    db.write(|tx| notes::set_archived(tx, &id, true)).unwrap();
    assert!(
        db.read(|c| notes::list(c, &NoteQuery::default()))
            .unwrap()
            .is_empty()
    );
    let archived = NoteQuery {
        scope: NoteScope::Archived,
        ..Default::default()
    };
    assert_eq!(db.read(|c| notes::list(c, &archived)).unwrap().len(), 1);
    // Purge only works from Trash.
    assert!(db.write(|tx| notes::purge(tx, &id)).is_err());
    db.write(|tx| notes::trash(tx, &id)).unwrap();
    assert_eq!(db.read(trash::list).unwrap().len(), 1);
    db.write(|tx| notes::restore(tx, &id)).unwrap();
    assert!(db.read(trash::list).unwrap().is_empty());
    db.write(|tx| notes::trash(tx, &id)).unwrap();
    db.write(|tx| notes::purge(tx, &id)).unwrap();
    assert!(matches!(
        db.read(|c| notes::get(c, &id)),
        Err(AppError::NotFound { .. })
    ));
}

// ---------------------------------------------------------------- documents

fn refactor_2fa(db: &Database) -> String {
    let note = quick_note(
        db,
        "Refactor 2FA\nMove TOTP verification to the auth service.",
    );
    db.write(|tx| tags::set(tx, tags::Tagged::Note, &note, &["security".into()]))
        .unwrap();
    db.write(|tx| documents::convert_from_note(tx, &note, None))
        .unwrap();
    note
}

#[test]
fn ca03_converting_a_note_keeps_its_text_in_one_content_tab() {
    let db = db();
    let original = "Refactor 2FA\nMove TOTP verification to the auth service.";
    let id = refactor_2fa(&db);
    let document = db.read(|c| documents::get(c, &id)).unwrap();
    assert_eq!(document.note.id, id, "same entity, same id");
    assert_eq!(document.note.kind, NoteKind::Document);
    assert_eq!(document.note.title, "Refactor 2FA");
    assert_eq!(document.note.body, None, "no duplicated body");
    assert_eq!(document.note.tags, ["security"]);
    assert_eq!(document.tabs.len(), 1);
    let tab = &document.tabs[0];
    assert_eq!(
        (tab.kind, tab.title.as_str()),
        (TabKind::Content, "Overview")
    );
    let plain: String = db
        .read(|c| {
            Ok(c.query_row(
                "SELECT plain_text FROM document_tabs WHERE id = ?1",
                [&tab.id],
                |r| r.get(0),
            )?)
        })
        .unwrap();
    assert_eq!(plain, original);
    let json: serde_json::Value =
        serde_json::from_str(tab.content_json.as_deref().unwrap()).unwrap();
    assert_eq!(
        json["content"][1]["content"][0]["text"],
        "Move TOTP verification to the auth service."
    );

    // Adding tabs leaves the original content untouched.
    db.write(|tx| documents::create_tab(tx, &id, TabKind::Content, "Implementation"))
        .unwrap();
    db.write(|tx| documents::create_tab(tx, &id, TabKind::Tasks, "To-dos"))
        .unwrap();
    let document = db.read(|c| documents::get(c, &id)).unwrap();
    assert_eq!(
        document
            .tabs
            .iter()
            .map(|t| t.title.as_str())
            .collect::<Vec<_>>(),
        ["Overview", "Implementation", "To-dos"]
    );
    assert_eq!(document.tabs[0].content_json, tab.content_json);
}

#[test]
fn conversion_can_be_undone_only_while_untouched() {
    let db = db();
    let id = quick_note(&db, "Draft idea");
    db.write(|tx| documents::convert_from_note(tx, &id, None))
        .unwrap();
    let note = db
        .write(|tx| documents::revert_conversion(tx, &id, "", "Draft idea"))
        .unwrap()
        .0;
    assert_eq!(
        (note.kind, note.body.as_deref()),
        (NoteKind::QuickNote, Some("Draft idea"))
    );

    db.write(|tx| documents::convert_from_note(tx, &id, None))
        .unwrap();
    db.write(|tx| documents::create_tab(tx, &id, TabKind::Tasks, "To-dos"))
        .unwrap();
    assert!(
        db.write(|tx| documents::revert_conversion(tx, &id, "", "Draft idea"))
            .is_err()
    );
}

#[test]
fn tabs_reorder_duplicate_and_keep_at_least_one() {
    let db = db();
    let (document, _) = db
        .write(|tx| {
            documents::create(
                tx,
                CreateDocument {
                    title: "Doc".into(),
                    space_id: None,
                },
            )
        })
        .unwrap();
    let first = document.tabs[0].id.clone();
    assert!(db.write(|tx| documents::delete_tab(tx, &first)).is_err());
    let (second, _) = db
        .write(|tx| documents::create_tab(tx, &document.note.id, TabKind::Tasks, "To-dos"))
        .unwrap();
    db.write(|tx| {
        documents::reorder_tabs(tx, &document.note.id, &[second.id.clone(), first.clone()])
    })
    .unwrap();
    let (copy, _) = db
        .write(|tx| documents::duplicate_tab(tx, &second.id))
        .unwrap();
    let order: Vec<String> = db
        .read(|c| documents::tabs(c, &document.note.id))
        .unwrap()
        .into_iter()
        .map(|t| t.id)
        .collect();
    assert_eq!(order, [second.id.clone(), copy.id.clone(), first.clone()]);
    db.write(|tx| documents::delete_tab(tx, &copy.id)).unwrap();
    db.write(|tx| documents::restore_tab(tx, &copy.id)).unwrap();
    assert_eq!(
        db.read(|c| documents::tabs(c, &document.note.id))
            .unwrap()
            .len(),
        3
    );
}

#[test]
fn tab_content_autosave_is_validated_and_guarded() {
    let db = db();
    let id = refactor_2fa(&db);
    let tab = db.read(|c| documents::get(c, &id)).unwrap().tabs.remove(0);
    let content = json!({"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "v2"}]}]}).to_string();
    let saved = db
        .write(|tx| documents::update_tab_content(tx, &tab.id, tab.rev, &content, "v2"))
        .unwrap()
        .0;
    assert_eq!(saved.rev, tab.rev + 1);
    let conflict = db
        .write(|tx| documents::update_tab_content(tx, &tab.id, tab.rev, &content, "v2"))
        .unwrap_err();
    assert_eq!(conflict.code(), ErrorCode::Conflict);
    let invalid = db
        .write(|tx| documents::update_tab_content(tx, &tab.id, saved.rev, "{not json", ""))
        .unwrap_err();
    assert_eq!(invalid.code(), ErrorCode::Validation);
}

// ---------------------------------------------------------------- the sync gate

/// Phase 2 gate / CA-04: a task created in a document's To-dos tab is one row with one id,
/// visible in Tasks (filtered by Work), in the document and in search; completing it anywhere
/// is seen everywhere.
#[test]
fn ca04_document_tasks_are_the_same_entity_in_every_view() {
    let db = db();
    let work = space_named(&db, "Work");
    let doc = refactor_2fa(&db);
    let (to_dos, _) = db
        .write(|tx| documents::create_tab(tx, &doc, TabKind::Tasks, "To-dos"))
        .unwrap();

    // Created from the Tasks tab: it only knows the document.
    let (created, changes) = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "Adicionar testes unitários".into(),
                    document_id: Some(doc.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap();
    assert!(changes.contains(EntityKind::Task, &created.id));
    assert!(
        changes.contains(EntityKind::Note, &doc),
        "the document view is told to refresh"
    );
    assert_eq!(created.space_id, work, "inherits the document's space");
    assert_eq!(created.document_title.as_deref(), Some("Refactor 2FA"));

    let in_tasks = db
        .read(|c| {
            tasks::list(
                c,
                &TaskQuery {
                    view: TaskView::All,
                    space_id: Some(work.clone()),
                    document_id: None,
                },
                today(),
            )
        })
        .unwrap();
    let in_tab = db
        .read(|c| tasks::list_for_document(c, &doc, to_dos.settings.show, to_dos.settings.sort))
        .unwrap();
    let in_search = db
        .read(|c| search::search(c, "unitários", None))
        .unwrap()
        .tasks;
    assert_eq!(
        in_tasks.iter().map(|t| &t.id).collect::<Vec<_>>(),
        [&created.id]
    );
    assert_eq!(
        in_tab.iter().map(|t| &t.id).collect::<Vec<_>>(),
        [&created.id]
    );
    assert_eq!(
        in_search.iter().map(|t| &t.id).collect::<Vec<_>>(),
        [&created.id]
    );

    // Complete from Tasks → the document's views reflect it.
    db.write(|tx| tasks::set_completed(tx, &created.id, true))
        .unwrap();
    let open_in_tab = db
        .read(|c| tasks::list_for_document(c, &doc, TasksTabShow::Open, TasksTabSort::Manual))
        .unwrap();
    let all_in_tab = db
        .read(|c| tasks::list_for_document(c, &doc, TasksTabShow::All, TasksTabSort::Manual))
        .unwrap();
    assert!(open_in_tab.is_empty());
    assert_eq!(all_in_tab[0].id, created.id);
    assert_eq!(all_in_tab[0].status, TaskStatus::Completed);
    let completed = db
        .read(|c| {
            tasks::list(
                c,
                &TaskQuery {
                    view: TaskView::Completed,
                    ..Default::default()
                },
                today(),
            )
        })
        .unwrap();
    assert_eq!(completed[0].id, created.id);

    // Reopen from the document (e.g. a sticky) → Tasks reflects it.
    db.write(|tx| tasks::set_completed(tx, &created.id, false))
        .unwrap();
    assert_eq!(
        db.read(|c| tasks::get(c, &created.id)).unwrap().status,
        TaskStatus::Open
    );

    // One database row, not three.
    assert_eq!(task_rows(&db, "Adicionar testes unitários"), 1);
}

/// CA-05: an editorial checklist inside a content tab never becomes a task.
#[test]
fn ca05_editorial_checklists_are_not_tasks() {
    let db = db();
    let doc = refactor_2fa(&db);
    let tab = db.read(|c| documents::get(c, &doc)).unwrap().tabs.remove(0);
    let checklist = json!({"type": "doc", "content": [{"type": "checklist", "content": [
        {"type": "checklistItem", "attrs": {"checked": false}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Read RFC 6238"}]}]}
    ]}]}).to_string();
    db.write(|tx| documents::update_tab_content(tx, &tab.id, tab.rev, &checklist, "Read RFC 6238"))
        .unwrap();
    let tasks_count: i64 = db
        .read(|c| Ok(c.query_row("SELECT count(*) FROM tasks", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(tasks_count, 0);
    // Explicitly creating a real task makes it appear everywhere.
    db.write(|tx| {
        tasks::create(
            tx,
            CreateTask {
                title: "Read RFC 6238".into(),
                document_id: Some(doc.clone()),
                ..Default::default()
            },
        )
    })
    .unwrap();
    assert_eq!(
        db.read(|c| tasks::list(c, &TaskQuery::default(), today()))
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn ca02_quick_task_without_metadata_survives_a_restart() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("piw.sqlite3");
    let id = {
        let db = Database::open(&path).unwrap();
        db.write(spaces::ensure_seeded).unwrap();
        let id = quick_task(&db, "Comprar café");
        db.write(|tx| tasks::set_completed(tx, &id, true)).unwrap();
        id
    };
    let db = Database::open(&path).unwrap();
    let task = db.read(|c| tasks::get(c, &id)).unwrap();
    assert_eq!(
        (task.title.as_str(), task.status),
        ("Comprar café", TaskStatus::Completed)
    );
    assert!(task.document_id.is_none() && task.due_date.is_none() && task.description.is_empty());
}

// ---------------------------------------------------------------- tasks

#[test]
fn today_upcoming_and_all_views_use_the_local_date() {
    let db = db();
    let make = |title: &str, due: Option<&str>| {
        db.write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: title.into(),
                    due_date: due.map(Into::into),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0
        .id
    };
    let overdue = make("overdue", Some("2026-11-01"));
    let due_today = make("today", Some("2026-11-06"));
    let later = make("later", Some("2026-11-20"));
    let undated = make("undated", None);
    let view = |view| {
        db.read(|c| {
            tasks::list(
                c,
                &TaskQuery {
                    view,
                    ..Default::default()
                },
                today(),
            )
        })
        .unwrap()
        .into_iter()
        .map(|t| t.id)
        .collect::<Vec<_>>()
    };
    assert_eq!(view(TaskView::Today), [overdue.clone(), due_today.clone()]);
    assert_eq!(view(TaskView::Upcoming), std::slice::from_ref(&later));
    assert_eq!(view(TaskView::All), [overdue, due_today, later, undated]);
    assert!(
        db.write(|tx| tasks::create(
            tx,
            CreateTask {
                title: "bad".into(),
                due_date: Some("2026-13-01".into()),
                ..Default::default()
            }
        ))
        .is_err()
    );
}

#[test]
fn subtasks_inherit_and_stay_one_level_deep() {
    let db = db();
    let doc = refactor_2fa(&db);
    let parent = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "Parent".into(),
                    document_id: Some(doc.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    let child = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "Child".into(),
                    parent_task_id: Some(parent.id.clone()),
                    due_date: Some("2026-12-01".into()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    assert_eq!(child.document_id.as_deref(), Some(doc.as_str()));
    assert_eq!(child.space_id, parent.space_id);
    assert_eq!(child.due_date, None, "subtasks carry no date");
    assert!(
        db.write(|tx| tasks::create(
            tx,
            CreateTask {
                title: "Grandchild".into(),
                parent_task_id: Some(child.id.clone()),
                ..Default::default()
            }
        ))
        .is_err()
    );
    // The trigger enforces the same rule even if the service were bypassed.
    let raw = db.write(|tx| {
        tx.execute(
            "INSERT INTO tasks (id, space_id, parent_task_id, title, sort_order, created_at, updated_at)
             VALUES ('x', ?1, ?2, 'raw', 0, 'now', 'now')",
            [&child.space_id, &child.id],
        )?;
        Ok(())
    });
    assert!(raw.is_err());

    db.write(|tx| tasks::set_completed(tx, &child.id, true))
        .unwrap();
    let detail = db.read(|c| tasks::detail(c, &parent.id)).unwrap();
    assert_eq!(
        (detail.task.subtask_count, detail.task.subtask_done),
        (1, 1)
    );
    assert_eq!(
        detail.task.status,
        TaskStatus::Open,
        "completing subtasks never completes the parent"
    );
    // Subtasks are not listed as top-level tasks.
    assert_eq!(
        db.read(|c| tasks::list(c, &TaskQuery::default(), today()))
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn task_text_edits_are_guarded_but_completion_is_not() {
    let db = db();
    let id = quick_task(&db, "Write report");
    // Completing from a sticky does not invalidate the drawer's pending text edit.
    db.write(|tx| tasks::set_completed(tx, &id, true)).unwrap();
    let saved = db
        .write(|tx| {
            tasks::update_text(
                tx,
                &id,
                1,
                UpdateTaskText {
                    description: Some("Draft by Friday".into()),
                    title: None,
                },
            )
        })
        .unwrap()
        .0;
    assert_eq!(saved.rev, 2);
    assert_eq!(saved.status, TaskStatus::Completed);
    assert!(
        db.write(|tx| tasks::update_text(tx, &id, 1, UpdateTaskText::default()))
            .is_err()
    );
}

#[test]
fn reorder_keeps_the_block_in_place() {
    let db = db();
    let ids: Vec<String> = ["a", "b", "c"].iter().map(|t| quick_task(&db, t)).collect();
    db.write(|tx| tasks::reorder(tx, &[ids[2].clone(), ids[0].clone(), ids[1].clone()]))
        .unwrap();
    let order: Vec<String> = db
        .read(|c| tasks::list(c, &TaskQuery::default(), today()))
        .unwrap()
        .into_iter()
        .map(|t| t.title)
        .collect();
    assert_eq!(order, ["c", "a", "b"]);
}

#[test]
fn moving_a_task_to_another_space_unlinks_a_foreign_document() {
    let db = db();
    let personal = space_named(&db, "Personal");
    let doc = refactor_2fa(&db);
    let task = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "t".into(),
                    document_id: Some(doc.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    let moved = db
        .write(|tx| tasks::move_to_space(tx, &task.id, &personal))
        .unwrap()
        .0;
    assert_eq!(
        (moved.space_id.as_str(), moved.document_id.as_deref()),
        (personal.as_str(), None)
    );
}

// ---------------------------------------------------------------- documents and their tasks

#[test]
fn trashing_a_document_can_keep_or_trash_its_tasks() {
    let db = db();
    for policy in [LinkedTasks::Keep, LinkedTasks::Trash] {
        let doc = refactor_2fa(&db);
        let task = db
            .write(|tx| {
                tasks::create(
                    tx,
                    CreateTask {
                        title: format!("{policy:?}"),
                        document_id: Some(doc.clone()),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .0;
        db.write(|tx| documents::trash(tx, &doc, policy)).unwrap();
        let after = db.read(|c| tasks::get(c, &task.id)).unwrap();
        match policy {
            LinkedTasks::Keep => {
                assert!(after.deleted_at.is_none() && after.document_id.is_none());
            }
            LinkedTasks::Trash => {
                assert!(after.deleted_at.is_some());
                db.write(|tx| documents::restore(tx, &doc)).unwrap();
                let restored = db.read(|c| tasks::get(c, &task.id)).unwrap();
                assert!(restored.deleted_at.is_none());
                assert_eq!(restored.document_id.as_deref(), Some(doc.as_str()));
            }
        }
    }
}

#[test]
fn restoring_an_item_whose_document_is_in_trash_unlinks_it() {
    let db = db();
    let doc = refactor_2fa(&db);
    let task = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "t".into(),
                    document_id: Some(doc.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    db.write(|tx| documents::trash(tx, &doc, LinkedTasks::Trash))
        .unwrap();
    let (unlinked, _) = db.write(|tx| tasks::restore(tx, &task.id)).unwrap();
    assert!(unlinked);
    assert_eq!(
        db.read(|c| tasks::get(c, &task.id)).unwrap().document_id,
        None
    );
}

#[test]
fn moving_a_document_moves_its_tasks_subtasks_and_notes() {
    let db = db();
    let personal = space_named(&db, "Personal");
    let doc = refactor_2fa(&db);
    let parent = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "p".into(),
                    document_id: Some(doc.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    let child = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "c".into(),
                    parent_task_id: Some(parent.id.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    let grouped = db
        .write(|tx| {
            notes::create(
                tx,
                CreateNote {
                    body: "ref".into(),
                    document_id: Some(doc.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    let preview = db.read(|c| documents::move_preview(c, &doc)).unwrap();
    assert_eq!((preview.tasks, preview.notes), (1, 1));
    db.write(|tx| documents::move_to_space(tx, &doc, &personal))
        .unwrap();
    for space in [
        db.read(|c| notes::get(c, &doc)).unwrap().space_id,
        db.read(|c| tasks::get(c, &parent.id)).unwrap().space_id,
        db.read(|c| tasks::get(c, &child.id)).unwrap().space_id,
        db.read(|c| notes::get(c, &grouped.id)).unwrap().space_id,
    ] {
        assert_eq!(space, personal);
    }
}

// ---------------------------------------------------------------- inbox, search, tags

#[test]
fn inbox_holds_unorganised_captures_only() {
    let db = db();
    let note = quick_note(&db, "idea");
    let task = quick_task(&db, "todo");
    let done = quick_task(&db, "done");
    db.write(|tx| tasks::set_completed(tx, &done, true))
        .unwrap();
    let doc = refactor_2fa(&db);
    db.write(|tx| {
        tasks::create(
            tx,
            CreateTask {
                title: "linked".into(),
                document_id: Some(doc),
                ..Default::default()
            },
        )
    })
    .unwrap();
    let ids = |db: &Database| -> Vec<String> {
        db.read(|c| inbox::list(c, None))
            .unwrap()
            .into_iter()
            .map(|i| match i {
                InboxItem::Note { note } => note.id,
                InboxItem::Task { task } => task.id,
            })
            .collect()
    };
    assert_eq!(
        ids(&db),
        [task.clone(), note.clone()],
        "newest first, no documents, no linked or completed tasks"
    );
    assert_eq!(db.read(|c| inbox::count(c, None)).unwrap(), 2);
    db.write(|tx| notes::mark_triaged(tx, &note, true)).unwrap();
    assert_eq!(ids(&db), [task]);
    db.write(|tx| inbox::mark_all_triaged(tx, None)).unwrap();
    assert!(ids(&db).is_empty());
}

#[test]
fn ca09_search_finds_documents_notes_and_tasks() {
    let db = db();
    let doc = refactor_2fa(&db);
    let (tab, _) = db
        .write(|tx| documents::create_tab(tx, &doc, TabKind::Content, "Implementation"))
        .unwrap();
    let content = json!({"type": "doc", "content": []}).to_string();
    db.write(|tx| {
        documents::update_tab_content(
            tx,
            &tab.id,
            tab.rev,
            &content,
            "Use WebAuthn as a 2FA fallback",
        )
    })
    .unwrap();
    let note = quick_note(&db, "2FA recovery codes printed");
    let task = db
        .write(|tx| {
            tasks::create(
                tx,
                CreateTask {
                    title: "Review 2FA PR".into(),
                    document_id: Some(doc.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap()
        .0;
    quick_note(&db, "unrelated");

    let results = db.read(|c| search::search(c, "2fa", None)).unwrap();
    assert_eq!(
        results.documents.iter().map(|h| &h.id).collect::<Vec<_>>(),
        [&doc]
    );
    assert_eq!(
        results.notes.iter().map(|h| &h.id).collect::<Vec<_>>(),
        [&note]
    );
    assert_eq!(
        results.tasks.iter().map(|h| &h.id).collect::<Vec<_>>(),
        [&task.id]
    );
    assert_eq!(
        results.tasks[0].document_title.as_deref(),
        Some("Refactor 2FA")
    );
    assert!(results.notes[0].snippet.contains(search::MARK_START));

    // A match only inside a tab still finds the document and names the tab.
    let by_tab = db.read(|c| search::search(c, "webauthn", None)).unwrap();
    assert_eq!(
        by_tab.documents[0].tab_title.as_deref(),
        Some("Implementation")
    );

    // Accent-insensitive, prefix matching, operator-safe, Trash excluded.
    quick_note(&db, "Reunião de ação");
    assert_eq!(
        db.read(|c| search::search(c, "acao reun", None))
            .unwrap()
            .notes
            .len(),
        1
    );
    assert!(db.read(|c| search::search(c, "\"OR NEAR(", None)).is_ok());
    db.write(|tx| notes::trash(tx, &note)).unwrap();
    assert!(
        db.read(|c| search::search(c, "recovery", None))
            .unwrap()
            .notes
            .is_empty()
    );
}

#[test]
fn search_follows_edits_and_respects_the_space_filter() {
    let db = db();
    let personal = space_named(&db, "Personal");
    let id = quick_note(&db, "alpha");
    db.write(|tx| {
        notes::update_text(
            tx,
            &id,
            1,
            UpdateNoteText {
                body: Some("omega".into()),
                title: None,
            },
        )
    })
    .unwrap();
    assert!(
        db.read(|c| search::search(c, "alpha", None))
            .unwrap()
            .notes
            .is_empty()
    );
    assert_eq!(
        db.read(|c| search::search(c, "omega", None))
            .unwrap()
            .notes
            .len(),
        1
    );
    assert!(
        db.read(|c| search::search(c, "omega", Some(&personal)))
            .unwrap()
            .notes
            .is_empty()
    );
}

#[test]
fn tags_are_normalised_shared_and_cleaned_up() {
    let db = db();
    let note = quick_note(&db, "n");
    let task = quick_task(&db, "t");
    let (names, _) = db
        .write(|tx| {
            tags::set(
                tx,
                tags::Tagged::Note,
                &note,
                &["#Urgent".into(), "urgent".into(), " q4  plan ".into()],
            )
        })
        .unwrap();
    assert_eq!(names, ["q4 plan", "Urgent"]);
    db.write(|tx| tags::set(tx, tags::Tagged::Task, &task, &["URGENT".into()]))
        .unwrap();
    let all = db.read(tags::list).unwrap();
    assert_eq!(
        all.iter()
            .map(|t| (t.name.as_str(), t.usage))
            .collect::<Vec<_>>(),
        [("q4 plan", 1), ("Urgent", 2)]
    );
    db.write(|tx| tags::set(tx, tags::Tagged::Note, &note, &[]))
        .unwrap();
    assert_eq!(
        db.read(tags::list).unwrap().len(),
        1,
        "unused tags disappear"
    );
    assert_eq!(db.read(|c| tasks::get(c, &task)).unwrap().tags, ["Urgent"]);
}

// ---------------------------------------------------------------- settings, drafts, atomicity

#[test]
fn settings_have_defaults_and_validate_patches() {
    let db = db();
    let defaults = db.read(settings::get).unwrap();
    assert!(
        defaults.close_to_tray && !defaults.launch_at_login && !defaults.restore_stickies_on_launch
    );
    let patch = json!({"theme": "dark", "closeToTray": false})
        .as_object()
        .unwrap()
        .clone();
    let (updated, _) = db.write(|tx| settings::update(tx, patch)).unwrap();
    assert_eq!(updated.theme, settings::Theme::Dark);
    assert_eq!(db.read(settings::get).unwrap(), updated);
    let unknown = json!({"telemetry": true}).as_object().unwrap().clone();
    assert!(db.write(|tx| settings::update(tx, unknown)).is_err());
    let invalid = json!({"theme": "neon"}).as_object().unwrap().clone();
    assert!(db.write(|tx| settings::update(tx, invalid)).is_err());
}

#[test]
fn capture_drafts_survive_and_clear() {
    let db = db();
    let draft = drafts::CaptureDraft {
        mode: crate::platform::window::CaptureMode::Task,
        text: "Comprar café".into(),
        description: String::new(),
        space_id: None,
        due_date: None,
        pin: true,
        updated_at: None,
    };
    db.write(|tx| drafts::save(tx, &draft)).unwrap();
    let loaded = db.read(drafts::get).unwrap().unwrap();
    assert_eq!((loaded.text.as_str(), loaded.pin), ("Comprar café", true));
    assert!(loaded.updated_at.is_some());
    db.write(|tx| {
        drafts::save(
            tx,
            &drafts::CaptureDraft {
                text: "  ".into(),
                ..draft
            },
        )
    })
    .unwrap();
    assert!(db.read(drafts::get).unwrap().is_none());
}

#[test]
fn a_failed_operation_leaves_no_partial_changes() {
    let db = db();
    let result: Result<(), AppError> = db.write(|tx| {
        tasks::create(
            tx,
            CreateTask {
                title: "half-done".into(),
                ..Default::default()
            },
        )?;
        Err(AppError::validation(
            "simulated failure after the first write",
        ))
    });
    assert!(result.is_err());
    assert_eq!(task_rows(&db, "half-done"), 0);
}

#[test]
fn foreign_keys_and_checks_are_enforced() {
    let db = db();
    let raw = db.write(|tx| {
        tx.execute(
            "INSERT INTO notes (id, space_id, kind, title, created_at, updated_at)
             VALUES ('n', 'missing-space', 'quick_note', 't', 'now', 'now')",
            [],
        )?;
        Ok(())
    });
    assert!(raw.is_err(), "unknown space must be rejected");
    let note = quick_note(&db, "not a document");
    let grouped = db.write(|tx| {
        notes::create(
            tx,
            CreateNote {
                body: "x".into(),
                document_id: Some(note.clone()),
                ..Default::default()
            },
        )
    });
    assert!(
        grouped.is_err(),
        "notes can only be grouped under documents"
    );
}
