//! Inbox: a *view* of recent, unorganised captures — never a separate store (plan §2.3).
//!
//! Contents: quick notes and top-level tasks with no document link that are not archived,
//! completed, trashed or marked organised. Documents never appear.

use rusqlite::{Connection, Transaction, params};

use super::notes::{NOTE_SELECT, map_list_item};
use super::tasks::{TASK_SELECT, map_task};
use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::InboxItem;
use crate::domain::time::now;
use crate::error::AppResult;

const NOTE_FILTER: &str = "n.kind = 'quick_note' AND n.document_id IS NULL AND n.deleted_at IS NULL
                           AND n.archived_at IS NULL AND n.triaged_at IS NULL";
const TASK_FILTER: &str =
    "t.parent_task_id IS NULL AND t.document_id IS NULL AND t.deleted_at IS NULL
                           AND t.status = 'open' AND t.triaged_at IS NULL";

pub fn list(conn: &Connection, space_id: Option<&str>) -> AppResult<Vec<InboxItem>> {
    let mut items: Vec<(String, String, InboxItem)> = Vec::new();
    let mut stmt = conn.prepare_cached(&format!(
        "{NOTE_SELECT} WHERE {NOTE_FILTER} AND (?1 IS NULL OR n.space_id = ?1)"
    ))?;
    for note in stmt.query_map([space_id], map_list_item)? {
        let note = note?;
        items.push((
            note.created_at.clone(),
            note.id.clone(),
            InboxItem::Note { note },
        ));
    }
    let mut stmt = conn.prepare_cached(&format!(
        "{TASK_SELECT} WHERE {TASK_FILTER} AND (?1 IS NULL OR t.space_id = ?1)"
    ))?;
    for task in stmt.query_map([space_id], map_task)? {
        let task = task?;
        items.push((
            task.created_at.clone(),
            task.id.clone(),
            InboxItem::Task { task },
        ));
    }
    // Newest first; ids (UUIDv7) break ties deterministically.
    items.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| b.1.cmp(&a.1)));
    Ok(items.into_iter().map(|(_, _, item)| item).collect())
}

pub fn count(conn: &Connection, space_id: Option<&str>) -> AppResult<i64> {
    Ok(conn.query_row(
        &format!(
            "SELECT (SELECT count(*) FROM notes n WHERE {NOTE_FILTER} AND (?1 IS NULL OR n.space_id = ?1))
                  + (SELECT count(*) FROM tasks t WHERE {TASK_FILTER} AND (?1 IS NULL OR t.space_id = ?1))"
        ),
        [space_id],
        |r| r.get(0),
    )?)
}

/// "Mark all organised" for the current filter.
pub fn mark_all_triaged(tx: &Transaction<'_>, space_id: Option<&str>) -> AppResult<ChangeSet> {
    let mut changes = ChangeSet::new();
    for item in list(tx, space_id)? {
        match item {
            InboxItem::Note { note } => changes.add(EntityKind::Note, note.id),
            InboxItem::Task { task } => changes.add(EntityKind::Task, task.id),
        };
    }
    let ts = now();
    tx.execute(
        &format!("UPDATE notes AS n SET triaged_at = ?1 WHERE {NOTE_FILTER} AND (?2 IS NULL OR n.space_id = ?2)"),
        params![ts, space_id],
    )?;
    tx.execute(
        &format!("UPDATE tasks AS t SET triaged_at = ?1 WHERE {TASK_FILTER} AND (?2 IS NULL OR t.space_id = ?2)"),
        params![ts, space_id],
    )?;
    Ok(changes)
}
