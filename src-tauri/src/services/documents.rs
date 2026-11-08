//! Documents: notes with ordered tabs that also group related tasks and notes.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::json;
use ts_rs::TS;

use super::notes::{add_document_tasks, get as get_note};
use super::{apply_order, next_order, resolve_space};
use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::{Document, NoteKind, Tab, TabKind, TasksTabSettings};
use crate::domain::text::{NOTE_BODY_MAX_BYTES, display_title, require_max_bytes, require_name};
use crate::domain::{new_id, time::now};
use crate::error::{AppError, AppResult};

const TAB_COLUMNS: &str =
    "id, document_id, title, kind, sort_order, content_json, settings, rev, created_at, updated_at";
pub const DEFAULT_TAB_TITLE: &str = "Overview";

fn map_tab(row: &Row<'_>) -> rusqlite::Result<Tab> {
    let settings: Option<String> = row.get(6)?;
    Ok(Tab {
        id: row.get(0)?,
        document_id: row.get(1)?,
        title: row.get(2)?,
        kind: row.get(3)?,
        sort_order: row.get(4)?,
        content_json: row.get(5)?,
        settings: settings
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default(),
        rev: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

pub fn tabs(conn: &Connection, document_id: &str) -> AppResult<Vec<Tab>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {TAB_COLUMNS} FROM document_tabs
         WHERE document_id = ?1 AND deleted_at IS NULL ORDER BY sort_order, created_at"
    ))?;
    let rows = stmt.query_map([document_id], map_tab)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get_tab(conn: &Connection, id: &str) -> AppResult<Tab> {
    conn.query_row(
        &format!("SELECT {TAB_COLUMNS} FROM document_tabs WHERE id = ?1 AND deleted_at IS NULL"),
        [id],
        map_tab,
    )
    .optional()?
    .ok_or(AppError::NotFound { entity: "tab" })
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Document> {
    let note = get_note(conn, id)?;
    if note.kind != NoteKind::Document {
        return Err(AppError::NotFound { entity: "document" });
    }
    Ok(Document {
        tabs: tabs(conn, id)?,
        note,
    })
}

/// Builds the canonical editor JSON for plain text: one paragraph per line, text unchanged.
/// Used when the UI does not provide a richer conversion (see docs/architecture.md#documents-and-the-editor).
pub fn plain_text_to_doc_json(text: &str) -> String {
    let paragraphs: Vec<serde_json::Value> = text
        .split('\n')
        .map(|line| {
            let line = line.strip_suffix('\r').unwrap_or(line);
            if line.is_empty() {
                json!({ "type": "paragraph" })
            } else {
                json!({ "type": "paragraph", "content": [{ "type": "text", "text": line }] })
            }
        })
        .collect();
    json!({ "type": "doc", "content": paragraphs }).to_string()
}

fn validate_content(content_json: &str, plain_text: &str) -> AppResult<()> {
    require_max_bytes(content_json, NOTE_BODY_MAX_BYTES * 2, "The tab")?;
    require_max_bytes(plain_text, NOTE_BODY_MAX_BYTES, "The tab")?;
    let value: serde_json::Value = serde_json::from_str(content_json)
        .map_err(|_| AppError::validation("tab content is not valid JSON"))?;
    if value.get("type").and_then(|t| t.as_str()) != Some("doc") {
        return Err(AppError::validation(
            "tab content must be an editor document",
        ));
    }
    Ok(())
}

fn insert_tab(
    tx: &Transaction<'_>,
    document_id: &str,
    kind: TabKind,
    title: &str,
    content: Option<(&str, &str)>,
) -> AppResult<String> {
    let id = new_id();
    let ts = now();
    let order = next_order(
        tx,
        "SELECT max(sort_order) FROM document_tabs WHERE document_id = ?1 AND deleted_at IS NULL",
        [document_id],
    )?;
    let (content_json, plain_text) = match (kind, content) {
        (TabKind::Content, Some((json, text))) => (Some(json.to_owned()), text.to_owned()),
        (TabKind::Content, None) => (Some(plain_text_to_doc_json("")), String::new()),
        (TabKind::Tasks, _) => (None, String::new()),
    };
    let settings = match kind {
        TabKind::Tasks => Some(
            serde_json::to_string(&TasksTabSettings::default())
                .map_err(|e| AppError::Internal(e.to_string()))?,
        ),
        TabKind::Content => None,
    };
    tx.execute(
        "INSERT INTO document_tabs (id, document_id, title, kind, sort_order, content_json,
                                    plain_text, settings, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![
            id,
            document_id,
            title,
            kind,
            order,
            content_json,
            plain_text,
            settings,
            ts
        ],
    )?;
    Ok(id)
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct CreateDocument {
    pub title: String,
    #[ts(optional)]
    pub space_id: Option<String>,
}

/// Creates a document with a single empty Content tab.
pub fn create(tx: &Transaction<'_>, input: CreateDocument) -> AppResult<(Document, ChangeSet)> {
    let title = require_name(&input.title, "Document title", 300)?;
    let space_id = resolve_space(tx, input.space_id.as_deref())?;
    let id = new_id();
    let ts = now();
    tx.execute(
        "INSERT INTO notes (id, space_id, kind, title, body, created_at, updated_at)
         VALUES (?1, ?2, 'document', ?3, NULL, ?4, ?4)",
        params![id, space_id, title, ts],
    )?;
    let tab = insert_tab(tx, &id, TabKind::Content, DEFAULT_TAB_TITLE, None)?;
    Ok((
        get(tx, &id)?,
        ChangeSet::new()
            .with(EntityKind::Note, &id)
            .with(EntityKind::Tab, tab),
    ))
}

/// Converts a quick note into a document (CA-03). The note keeps its id, space, tags and
/// pins; its text moves unchanged into a single Content tab. `content` is the editor JSON and
/// plain text produced by the UI; without it the text is converted line by line.
pub fn convert_from_note(
    tx: &Transaction<'_>,
    note_id: &str,
    content: Option<(String, String)>,
) -> AppResult<(Document, ChangeSet)> {
    let note = get_note(tx, note_id)?;
    if note.kind != NoteKind::QuickNote {
        return Err(AppError::validation("this is already a document"));
    }
    if note.deleted_at.is_some() {
        return Err(AppError::validation("restore the note from Trash first"));
    }
    let body = note.body.clone().unwrap_or_default();
    let (content_json, plain_text) = match content {
        Some((json, text)) => {
            validate_content(&json, &text)?;
            (json, text)
        }
        None => (plain_text_to_doc_json(&body), body.clone()),
    };
    let mut title = display_title(&note.title, Some(&body));
    if title.is_empty() {
        title = "Untitled".to_owned();
    }
    tx.execute(
        "UPDATE notes SET kind = 'document', title = ?1, body = NULL, document_id = NULL,
                          rev = rev + 1, updated_at = ?2
         WHERE id = ?3",
        params![title, now(), note_id],
    )?;
    let tab = insert_tab(
        tx,
        note_id,
        TabKind::Content,
        DEFAULT_TAB_TITLE,
        Some((&content_json, &plain_text)),
    )?;
    let mut changes = ChangeSet::new()
        .with(EntityKind::Note, note_id)
        .with(EntityKind::Tab, tab);
    if let Some(old) = note.document_id {
        changes.add(EntityKind::Note, old);
    }
    Ok((get(tx, note_id)?, changes))
}

/// Undo for [`convert_from_note`]: only allowed while nothing was added or edited since, so
/// no structure can be lost. `body` is the note's original text, kept by the UI.
pub fn revert_conversion(
    tx: &Transaction<'_>,
    document_id: &str,
    title: &str,
    body: &str,
) -> AppResult<(crate::domain::model::Note, ChangeSet)> {
    let document = get(tx, document_id)?;
    let untouched =
        matches!(document.tabs.as_slice(), [tab] if tab.kind == TabKind::Content && tab.rev == 1);
    let linked: i64 = tx.query_row(
        "SELECT (SELECT count(*) FROM tasks WHERE document_id = ?1)
              + (SELECT count(*) FROM notes WHERE document_id = ?1)",
        [document_id],
        |r| r.get(0),
    )?;
    if !untouched || linked > 0 {
        return Err(AppError::validation(
            "the document has changed since it was converted and can't be turned back into a note",
        ));
    }
    require_max_bytes(body, NOTE_BODY_MAX_BYTES, "The note")?;
    tx.execute(
        "DELETE FROM document_tabs WHERE document_id = ?1",
        [document_id],
    )?;
    tx.execute(
        "UPDATE notes SET kind = 'quick_note', title = ?1, body = ?2, sidebar_order = NULL,
                          rev = rev + 1, updated_at = ?3
         WHERE id = ?4",
        params![title.trim(), body, now(), document_id],
    )?;
    let mut changes = ChangeSet::new().with(EntityKind::Note, document_id);
    for tab in document.tabs {
        changes.add(EntityKind::Tab, tab.id);
    }
    Ok((get_note(tx, document_id)?, changes))
}

fn live_document(tx: &Connection, document_id: &str) -> AppResult<()> {
    let document = get(tx, document_id)?;
    if document.note.deleted_at.is_some() {
        return Err(AppError::validation(
            "restore the document from Trash first",
        ));
    }
    Ok(())
}

pub fn create_tab(
    tx: &Transaction<'_>,
    document_id: &str,
    kind: TabKind,
    title: &str,
) -> AppResult<(Tab, ChangeSet)> {
    live_document(tx, document_id)?;
    let title = require_name(title, "Tab name", 80)?;
    let id = insert_tab(tx, document_id, kind, &title, None)?;
    touch_document(tx, document_id)?;
    Ok((
        get_tab(tx, &id)?,
        ChangeSet::new()
            .with(EntityKind::Tab, &id)
            .with(EntityKind::Note, document_id),
    ))
}

fn touch_document(tx: &Transaction<'_>, document_id: &str) -> AppResult<()> {
    tx.execute(
        "UPDATE notes SET updated_at = ?1 WHERE id = ?2",
        params![now(), document_id],
    )?;
    Ok(())
}

pub fn rename_tab(tx: &Transaction<'_>, id: &str, title: &str) -> AppResult<(Tab, ChangeSet)> {
    let title = require_name(title, "Tab name", 80)?;
    let tab = get_tab(tx, id)?;
    tx.execute(
        "UPDATE document_tabs SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now(), id],
    )?;
    Ok((
        get_tab(tx, id)?,
        ChangeSet::new()
            .with(EntityKind::Tab, id)
            .with(EntityKind::Note, tab.document_id),
    ))
}

pub fn reorder_tabs(
    tx: &Transaction<'_>,
    document_id: &str,
    ids: &[String],
) -> AppResult<ChangeSet> {
    let current: Vec<String> = tabs(tx, document_id)?.into_iter().map(|t| t.id).collect();
    apply_order(tx, "document_tabs", ids, &current)?;
    let mut changes = ChangeSet::new().with(EntityKind::Note, document_id);
    for id in ids {
        changes.add(EntityKind::Tab, id.clone());
    }
    Ok(changes)
}

/// Autosaves a content tab. `plain_text` is derived by the editor and indexed for search.
pub fn update_tab_content(
    tx: &Transaction<'_>,
    id: &str,
    expected_rev: i64,
    content_json: &str,
    plain_text: &str,
) -> AppResult<(Tab, ChangeSet)> {
    let tab = get_tab(tx, id)?;
    if tab.kind != TabKind::Content {
        return Err(AppError::validation("only content tabs have text"));
    }
    if tab.rev != expected_rev {
        return Err(AppError::Conflict { entity: "tab" });
    }
    validate_content(content_json, plain_text)?;
    let ts = now();
    tx.execute(
        "UPDATE document_tabs SET content_json = ?1, plain_text = ?2, rev = rev + 1, updated_at = ?3
         WHERE id = ?4 AND rev = ?5",
        params![content_json, plain_text, ts, id, expected_rev],
    )?;
    touch_document(tx, &tab.document_id)?;
    Ok((
        get_tab(tx, id)?,
        ChangeSet::new()
            .with(EntityKind::Tab, id)
            .with(EntityKind::Note, tab.document_id),
    ))
}

pub fn update_tab_settings(
    tx: &Transaction<'_>,
    id: &str,
    settings: &TasksTabSettings,
) -> AppResult<(Tab, ChangeSet)> {
    let tab = get_tab(tx, id)?;
    if tab.kind != TabKind::Tasks {
        return Err(AppError::validation("only tasks tabs have task settings"));
    }
    let json = serde_json::to_string(settings).map_err(|e| AppError::Internal(e.to_string()))?;
    tx.execute(
        "UPDATE document_tabs SET settings = ?1, updated_at = ?2 WHERE id = ?3",
        params![json, now(), id],
    )?;
    Ok((
        get_tab(tx, id)?,
        ChangeSet::new()
            .with(EntityKind::Tab, id)
            .with(EntityKind::Note, tab.document_id),
    ))
}

/// Duplicates a tab after itself. Tasks tabs duplicate their settings, never the tasks.
pub fn duplicate_tab(tx: &Transaction<'_>, id: &str) -> AppResult<(Tab, ChangeSet)> {
    let tab = get_tab(tx, id)?;
    let title: String = format!("{} copy", tab.title).chars().take(80).collect();
    let plain_text: String = tx.query_row(
        "SELECT plain_text FROM document_tabs WHERE id = ?1",
        [id],
        |r| r.get(0),
    )?;
    let new_id = match tab.kind {
        TabKind::Content => insert_tab(
            tx,
            &tab.document_id,
            TabKind::Content,
            &title,
            tab.content_json
                .as_deref()
                .map(|json| (json, plain_text.as_str())),
        )?,
        TabKind::Tasks => {
            let new_id = insert_tab(tx, &tab.document_id, TabKind::Tasks, &title, None)?;
            update_tab_settings(tx, &new_id, &tab.settings)?;
            new_id
        }
    };
    // Place the copy right after the original.
    let mut order: Vec<String> = tabs(tx, &tab.document_id)?
        .into_iter()
        .map(|t| t.id)
        .filter(|t| t != &new_id)
        .collect();
    let position = order
        .iter()
        .position(|t| t == id)
        .map_or(order.len(), |p| p + 1);
    order.insert(position, new_id.clone());
    reorder_tabs(tx, &tab.document_id, &order)?;
    Ok((
        get_tab(tx, &new_id)?,
        ChangeSet::new()
            .with(EntityKind::Tab, &new_id)
            .with(EntityKind::Note, tab.document_id),
    ))
}

/// Removes a tab (recoverable with [`restore_tab`] for undo). A document keeps at least one
/// tab. Removing a Tasks tab never touches the tasks.
pub fn delete_tab(tx: &Transaction<'_>, id: &str) -> AppResult<ChangeSet> {
    let tab = get_tab(tx, id)?;
    if tabs(tx, &tab.document_id)?.len() <= 1 {
        return Err(AppError::validation("a document needs at least one tab"));
    }
    tx.execute(
        "UPDATE document_tabs SET deleted_at = ?1 WHERE id = ?2",
        params![now(), id],
    )?;
    Ok(ChangeSet::new()
        .with(EntityKind::Tab, id)
        .with(EntityKind::Note, tab.document_id))
}

pub fn restore_tab(tx: &Transaction<'_>, id: &str) -> AppResult<(Tab, ChangeSet)> {
    let document_id: String = tx
        .query_row(
            "SELECT document_id FROM document_tabs WHERE id = ?1",
            [id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: "tab" })?;
    tx.execute(
        "UPDATE document_tabs SET deleted_at = NULL WHERE id = ?1",
        [id],
    )?;
    Ok((
        get_tab(tx, id)?,
        ChangeSet::new()
            .with(EntityKind::Tab, id)
            .with(EntityKind::Note, document_id),
    ))
}

/// What happens to a document's tasks when it goes to Trash (UX spec §4.11).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum LinkedTasks {
    /// Keep the tasks in Tasks and remove their link.
    Keep,
    /// Move the tasks to Trash with the document; restoring the document brings them back.
    Trash,
}

pub fn trash(tx: &Transaction<'_>, id: &str, linked: LinkedTasks) -> AppResult<ChangeSet> {
    let document = get(tx, id)?;
    if document.note.deleted_at.is_some() {
        return Ok(ChangeSet::new());
    }
    let ts = now();
    let mut changes = ChangeSet::new().with(EntityKind::Note, id);
    add_document_tasks(tx, id, &mut changes)?;
    tx.execute(
        "UPDATE notes SET deleted_at = ?1 WHERE id = ?2",
        params![ts, id],
    )?;
    match linked {
        LinkedTasks::Keep => {
            tx.execute(
                "UPDATE tasks SET document_id = NULL, updated_at = ?1 WHERE document_id = ?2",
                params![ts, id],
            )?;
        }
        LinkedTasks::Trash => {
            tx.execute(
                "UPDATE tasks SET deleted_at = ?1 WHERE document_id = ?2 AND deleted_at IS NULL",
                params![ts, id],
            )?;
        }
    }
    // Grouped notes stay where they are, without the group.
    let mut stmt = tx.prepare_cached("SELECT id FROM notes WHERE document_id = ?1")?;
    for note in stmt.query_map([id], |r| r.get::<_, String>(0))? {
        changes.add(EntityKind::Note, note?);
    }
    tx.execute(
        "UPDATE notes SET document_id = NULL, updated_at = ?1 WHERE document_id = ?2",
        params![ts, id],
    )?;
    Ok(changes)
}

/// Restores a document and the tasks that went to Trash together with it.
pub fn restore(tx: &Transaction<'_>, id: &str) -> AppResult<ChangeSet> {
    let deleted_at: Option<String> = tx
        .query_row(
            "SELECT deleted_at FROM notes WHERE id = ?1 AND kind = 'document'",
            [id],
            |r| r.get(0),
        )
        .optional()?
        .ok_or(AppError::NotFound { entity: "document" })?;
    let Some(deleted_at) = deleted_at else {
        return Ok(ChangeSet::new());
    };
    let mut changes = ChangeSet::new().with(EntityKind::Note, id);
    add_document_tasks(tx, id, &mut changes)?;
    tx.execute(
        "UPDATE tasks SET deleted_at = NULL WHERE document_id = ?1 AND deleted_at = ?2",
        params![id, deleted_at],
    )?;
    tx.execute(
        "UPDATE notes SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
        params![now(), id],
    )?;
    Ok(changes)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct MovePreview {
    pub tasks: i64,
    pub notes: i64,
}

/// Counts what moves with a document (shown in the confirmation dialog).
pub fn move_preview(conn: &Connection, id: &str) -> AppResult<MovePreview> {
    get(conn, id)?;
    Ok(conn.query_row(
        "SELECT (SELECT count(*) FROM tasks WHERE document_id = ?1 AND parent_task_id IS NULL
                                         AND deleted_at IS NULL),
                (SELECT count(*) FROM notes WHERE document_id = ?1 AND deleted_at IS NULL)",
        [id],
        |r| {
            Ok(MovePreview {
                tasks: r.get(0)?,
                notes: r.get(1)?,
            })
        },
    )?)
}

/// Moves a document together with its tasks (and their subtasks) and grouped notes.
pub fn move_to_space(
    tx: &Transaction<'_>,
    id: &str,
    space_id: &str,
) -> AppResult<(Document, ChangeSet)> {
    get(tx, id)?;
    resolve_space(tx, Some(space_id))?;
    let ts = now();
    let mut changes = ChangeSet::new().with(EntityKind::Note, id);
    add_document_tasks(tx, id, &mut changes)?;
    tx.execute(
        "UPDATE notes SET space_id = ?1, updated_at = ?2 WHERE id = ?3 OR document_id = ?3",
        params![space_id, ts, id],
    )?;
    tx.execute(
        "UPDATE tasks SET space_id = ?1, updated_at = ?2
         WHERE document_id = ?3
            OR parent_task_id IN (SELECT id FROM tasks WHERE document_id = ?3)",
        params![space_id, ts, id],
    )?;
    let mut stmt = tx.prepare_cached("SELECT id FROM notes WHERE document_id = ?1")?;
    for note in stmt.query_map([id], |r| r.get::<_, String>(0))? {
        changes.add(EntityKind::Note, note?);
    }
    Ok((get(tx, id)?, changes))
}

/// Adds a document to the favourites (at the end, stored as `sidebar_order`) or removes it.
pub fn set_in_sidebar(tx: &Transaction<'_>, id: &str, in_sidebar: bool) -> AppResult<ChangeSet> {
    get(tx, id)?;
    let order = if in_sidebar {
        Some(next_order(
            tx,
            "SELECT max(sidebar_order) FROM notes WHERE kind = 'document'",
            [],
        )?)
    } else {
        None
    };
    tx.execute(
        "UPDATE notes SET sidebar_order = CASE WHEN ?1 THEN coalesce(sidebar_order, ?2) END
         WHERE id = ?3",
        params![in_sidebar, order, id],
    )?;
    Ok(ChangeSet::new().with(EntityKind::Note, id))
}
