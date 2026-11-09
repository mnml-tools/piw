//! Quick notes (and the parts of documents that live in the `notes` table).

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::Deserialize;
use ts_rs::TS;

use super::{resolve_space, split_list};
use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::{Note, NoteKind, NoteListItem};
use crate::domain::text::{
    NOTE_BODY_MAX_BYTES, checklist_progress, display_title, excerpt, require_max_bytes,
};
use crate::domain::{new_id, time::now};
use crate::error::{AppError, AppResult};

/// Columns for [`map_note`]; `n` is the note, `d` its (optional) document.
pub(crate) const NOTE_SELECT: &str = "
    SELECT n.id, n.space_id, n.kind, n.title, n.body, n.document_id, d.title, n.sidebar_order,
           n.rev, n.triaged_at, n.created_at, n.updated_at, n.archived_at, n.deleted_at,
           (SELECT group_concat(name, char(31)) FROM
               (SELECT t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
                WHERE nt.note_id = n.id ORDER BY t.name COLLATE NOCASE)),
           EXISTS (SELECT 1 FROM sticky_windows s WHERE s.target_kind = 'note' AND s.target_id = n.id),
           (SELECT count(*) FROM tasks k
             WHERE k.document_id = n.id AND k.deleted_at IS NULL AND k.parent_task_id IS NULL)
      FROM notes n LEFT JOIN notes d ON d.id = n.document_id";

pub(crate) fn map_note(row: &Row<'_>) -> rusqlite::Result<Note> {
    let title: String = row.get(3)?;
    let body: Option<String> = row.get(4)?;
    Ok(Note {
        id: row.get(0)?,
        space_id: row.get(1)?,
        kind: row.get(2)?,
        display_title: display_title(&title, body.as_deref()),
        title,
        body,
        document_id: row.get(5)?,
        document_title: row.get(6)?,
        sidebar_order: row.get(7)?,
        rev: row.get(8)?,
        triaged_at: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        archived_at: row.get(12)?,
        deleted_at: row.get(13)?,
        tags: split_list(row.get(14)?),
        pinned: row.get(15)?,
    })
}

pub(crate) fn map_list_item(row: &Row<'_>) -> rusqlite::Result<NoteListItem> {
    let note = map_note(row)?;
    let (checklist_done, checklist_count) = checklist_progress(note.body.as_deref());
    Ok(NoteListItem {
        excerpt: excerpt(&note.title, note.body.as_deref()),
        id: note.id,
        space_id: note.space_id,
        kind: note.kind,
        display_title: note.display_title,
        document_id: note.document_id,
        document_title: note.document_title,
        sidebar_order: note.sidebar_order,
        tags: note.tags,
        pinned: note.pinned,
        task_count: row.get(16)?,
        checklist_count,
        checklist_done,
        created_at: note.created_at,
        updated_at: note.updated_at,
        archived_at: note.archived_at,
        deleted_at: note.deleted_at,
    })
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Note> {
    conn.query_row(&format!("{NOTE_SELECT} WHERE n.id = ?1"), [id], map_note)
        .optional()?
        .ok_or(AppError::NotFound { entity: "note" })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS, Default)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum NoteSort {
    #[default]
    Updated,
    Created,
    Title,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, TS, Default)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum NoteScope {
    #[default]
    Active,
    Archived,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct NoteQuery {
    #[ts(optional)]
    pub space_id: Option<String>,
    pub scope: NoteScope,
    pub sort: NoteSort,
    /// Only documents.
    pub documents_only: bool,
}

pub fn list(conn: &Connection, query: &NoteQuery) -> AppResult<Vec<NoteListItem>> {
    let scope = match query.scope {
        NoteScope::Active => "n.archived_at IS NULL",
        NoteScope::Archived => "n.archived_at IS NOT NULL",
    };
    let order = match query.sort {
        NoteSort::Updated => "n.updated_at DESC, n.id DESC",
        NoteSort::Created => "n.created_at DESC, n.id DESC",
        // Display titles are computed in Rust; sort after mapping.
        NoteSort::Title => "n.updated_at DESC",
    };
    let sql = format!(
        "{NOTE_SELECT}
         WHERE n.deleted_at IS NULL AND {scope}
           AND (?1 IS NULL OR n.space_id = ?1)
           AND (?2 = 0 OR n.kind = 'document')
         ORDER BY {order}"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    let rows = stmt.query_map(params![query.space_id, query.documents_only], map_list_item)?;
    let mut items: Vec<NoteListItem> = rows.collect::<Result<_, _>>()?;
    if query.sort == NoteSort::Title {
        items.sort_by_cached_key(|n| n.display_title.to_lowercase());
    }
    Ok(items)
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct CreateNote {
    #[ts(optional)]
    pub space_id: Option<String>,
    pub title: String,
    pub body: String,
    #[ts(optional)]
    pub document_id: Option<String>,
}

/// Creates a quick note. Empty notes are rejected so stray clicks never create records.
pub fn create(tx: &Transaction<'_>, input: CreateNote) -> AppResult<(Note, ChangeSet)> {
    if input.title.trim().is_empty() && input.body.trim().is_empty() {
        return Err(AppError::validation("a note needs some text"));
    }
    if input.title.chars().count() > 300 {
        return Err(AppError::validation("the title is too long"));
    }
    require_max_bytes(&input.body, NOTE_BODY_MAX_BYTES, "The note")?;
    let mut space_id = resolve_space(tx, input.space_id.as_deref())?;
    if let Some(document_id) = &input.document_id {
        space_id = live_document_space(tx, document_id)?;
    }
    let id = new_id();
    let ts = now();
    tx.execute(
        "INSERT INTO notes (id, space_id, kind, title, body, document_id, created_at, updated_at)
         VALUES (?1, ?2, 'quick_note', ?3, ?4, ?5, ?6, ?6)",
        params![
            id,
            space_id,
            input.title.trim(),
            input.body,
            input.document_id,
            ts
        ],
    )?;
    let mut changes = ChangeSet::new().with(EntityKind::Note, &id);
    if let Some(document_id) = input.document_id {
        changes.add(EntityKind::Note, document_id);
    }
    Ok((get(tx, &id)?, changes))
}

/// Space of a document that is not in Trash (items can only be grouped under live documents).
pub(crate) fn live_document_space(conn: &Connection, document_id: &str) -> AppResult<String> {
    conn.query_row(
        "SELECT space_id FROM notes WHERE id = ?1 AND kind = 'document' AND deleted_at IS NULL",
        [document_id],
        |r| r.get(0),
    )
    .optional()?
    .ok_or(AppError::NotFound { entity: "document" })
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct UpdateNoteText {
    #[ts(optional)]
    pub title: Option<String>,
    #[ts(optional)]
    pub body: Option<String>,
}

/// Saves edited text. Fails with `conflict` when another window saved first (`expected_rev`).
pub fn update_text(
    tx: &Transaction<'_>,
    id: &str,
    expected_rev: i64,
    patch: UpdateNoteText,
) -> AppResult<(Note, ChangeSet)> {
    let note = get(tx, id)?;
    if note.deleted_at.is_some() {
        return Err(AppError::validation(
            "restore the note from Trash before editing it",
        ));
    }
    if note.rev != expected_rev {
        return Err(AppError::Conflict { entity: "note" });
    }
    let title = patch
        .title
        .map(|t| t.trim().to_owned())
        .unwrap_or(note.title);
    if title.chars().count() > 300 {
        return Err(AppError::validation("the title is too long"));
    }
    if note.kind == NoteKind::Document && title.is_empty() {
        return Err(AppError::validation("documents need a title"));
    }
    let body = match (note.kind, patch.body) {
        (NoteKind::Document, Some(_)) => {
            return Err(AppError::validation("document text lives in its tabs"));
        }
        (_, Some(body)) => {
            require_max_bytes(&body, NOTE_BODY_MAX_BYTES, "The note")?;
            Some(body)
        }
        (_, None) => note.body,
    };
    tx.execute(
        "UPDATE notes SET title = ?1, body = ?2, rev = rev + 1, updated_at = ?3
         WHERE id = ?4 AND rev = ?5",
        params![title, body, now(), id, expected_rev],
    )?;
    Ok((get(tx, id)?, ChangeSet::new().with(EntityKind::Note, id)))
}

/// Deletes a quick note permanently if it has no text (an abandoned draft). Returns whether it
/// was deleted; notes with text are left untouched.
pub fn discard_if_empty(tx: &Transaction<'_>, id: &str) -> AppResult<(bool, ChangeSet)> {
    let deleted = tx.execute(
        "DELETE FROM notes WHERE id = ?1 AND kind = 'quick_note'
           AND trim(title) = '' AND trim(coalesce(body, '')) = ''",
        [id],
    )?;
    let changes = if deleted > 0 {
        ChangeSet::new().with(EntityKind::Note, id)
    } else {
        ChangeSet::new()
    };
    Ok((deleted > 0, changes))
}

pub fn set_archived(
    tx: &Transaction<'_>,
    id: &str,
    archived: bool,
) -> AppResult<(Note, ChangeSet)> {
    let ts = now();
    let changed = tx.execute(
        "UPDATE notes SET archived_at = CASE WHEN ?1 THEN coalesce(archived_at, ?2) END,
                          updated_at = ?2
         WHERE id = ?3 AND deleted_at IS NULL",
        params![archived, ts, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound { entity: "note" });
    }
    let note = get(tx, id)?;
    let mut changes = ChangeSet::new().with(EntityKind::Note, id);
    if note.kind == NoteKind::Document {
        // Linked tasks show "(archived)" after the document name.
        add_document_tasks(tx, id, &mut changes)?;
    }
    Ok((note, changes))
}

pub(crate) fn add_document_tasks(
    conn: &Connection,
    document_id: &str,
    changes: &mut ChangeSet,
) -> AppResult<()> {
    let mut stmt = conn.prepare_cached("SELECT id FROM tasks WHERE document_id = ?1")?;
    for id in stmt.query_map([document_id], |r| r.get::<_, String>(0))? {
        changes.add(EntityKind::Task, id?);
    }
    Ok(())
}

/// Moves a quick note to another space. Grouped notes leave their document, which lives in a
/// single space. Documents move with [`super::documents::move_to_space`].
pub fn move_to_space(
    tx: &Transaction<'_>,
    id: &str,
    space_id: &str,
) -> AppResult<(Note, ChangeSet)> {
    let note = get(tx, id)?;
    if note.kind == NoteKind::Document {
        return super::documents::move_to_space(tx, id, space_id).map(|(doc, c)| (doc.note, c));
    }
    resolve_space(tx, Some(space_id))?;
    let keep_document = match &note.document_id {
        Some(doc) => live_document_space(tx, doc).ok().as_deref() == Some(space_id),
        None => false,
    };
    tx.execute(
        "UPDATE notes SET space_id = ?1, document_id = CASE WHEN ?2 THEN document_id END,
                          updated_at = ?3
         WHERE id = ?4",
        params![space_id, keep_document, now(), id],
    )?;
    let mut changes = ChangeSet::new().with(EntityKind::Note, id);
    if let Some(doc) = note.document_id {
        changes.add(EntityKind::Note, doc);
    }
    Ok((get(tx, id)?, changes))
}

/// Moves a note or document to Trash. Documents use [`super::documents::trash`].
pub fn trash(tx: &Transaction<'_>, id: &str) -> AppResult<ChangeSet> {
    let note = get(tx, id)?;
    if note.kind == NoteKind::Document {
        return super::documents::trash(tx, id, super::documents::LinkedTasks::Keep);
    }
    tx.execute(
        "UPDATE notes SET deleted_at = coalesce(deleted_at, ?1) WHERE id = ?2",
        params![now(), id],
    )?;
    let mut changes = ChangeSet::new().with(EntityKind::Note, id);
    if let Some(doc) = note.document_id {
        changes.add(EntityKind::Note, doc);
    }
    Ok(changes)
}

/// Restores a quick note from Trash. Returns `true` in the flag when the note came back
/// without its document because that document is in Trash or gone.
pub fn restore(tx: &Transaction<'_>, id: &str) -> AppResult<(bool, ChangeSet)> {
    let note = get(tx, id)?;
    if note.kind == NoteKind::Document {
        return super::documents::restore(tx, id).map(|c| (false, c));
    }
    let document_alive = match &note.document_id {
        Some(doc) => live_document_space(tx, doc).is_ok(),
        None => true,
    };
    tx.execute(
        "UPDATE notes SET deleted_at = NULL, updated_at = ?1,
                          document_id = CASE WHEN ?2 THEN document_id END
         WHERE id = ?3",
        params![now(), document_alive, id],
    )?;
    Ok((!document_alive, ChangeSet::new().with(EntityKind::Note, id)))
}

/// Permanently deletes a note that is already in Trash.
pub fn purge(tx: &Transaction<'_>, id: &str) -> AppResult<ChangeSet> {
    let deleted = tx.execute(
        "DELETE FROM notes WHERE id = ?1 AND deleted_at IS NOT NULL",
        [id],
    )?;
    if deleted == 0 {
        return Err(AppError::validation(
            "only items in Trash can be deleted permanently",
        ));
    }
    Ok(ChangeSet::new().with(EntityKind::Note, id))
}

pub fn mark_triaged(tx: &Transaction<'_>, id: &str, triaged: bool) -> AppResult<ChangeSet> {
    let ts = now();
    tx.execute(
        "UPDATE notes SET triaged_at = CASE WHEN ?1 THEN coalesce(triaged_at, ?2) END WHERE id = ?3",
        params![triaged, ts, id],
    )?;
    Ok(ChangeSet::new().with(EntityKind::Note, id))
}
