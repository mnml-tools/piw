//! Trash: soft-deleted notes, documents and tasks. Nothing is purged automatically.

use rusqlite::{Connection, Transaction};

use super::notes::{NOTE_SELECT, map_list_item};
use super::tasks::{TASK_SELECT, map_task};
use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::TrashItem;
use crate::error::AppResult;

pub fn list(conn: &Connection) -> AppResult<Vec<TrashItem>> {
    let mut items: Vec<(String, TrashItem)> = Vec::new();
    let mut stmt = conn.prepare_cached(&format!("{NOTE_SELECT} WHERE n.deleted_at IS NOT NULL"))?;
    for note in stmt.query_map([], map_list_item)? {
        let note = note?;
        items.push((
            note.deleted_at.clone().unwrap_or_default(),
            TrashItem::Note { note },
        ));
    }
    // Tasks trashed together with their document are listed under the document only when the
    // document is also in Trash; subtasks trashed with a trashed parent are implied by it.
    let mut stmt = conn.prepare_cached(&format!(
        "{TASK_SELECT} WHERE t.deleted_at IS NOT NULL
           AND NOT (t.parent_task_id IS NOT NULL
                    AND (SELECT deleted_at FROM tasks p WHERE p.id = t.parent_task_id) IS NOT NULL)"
    ))?;
    for task in stmt.query_map([], map_task)? {
        let task = task?;
        items.push((
            task.deleted_at.clone().unwrap_or_default(),
            TrashItem::Task { task },
        ));
    }
    items.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(items.into_iter().map(|(_, item)| item).collect())
}

/// Permanently deletes everything in Trash ("Empty trash…", confirmed in the UI).
pub fn empty(tx: &Transaction<'_>) -> AppResult<ChangeSet> {
    let mut changes = ChangeSet::new();
    for item in list(tx)? {
        match item {
            TrashItem::Note { note } => changes.add(EntityKind::Note, note.id),
            TrashItem::Task { task } => changes.add(EntityKind::Task, task.id),
        };
    }
    // Tasks first so documents' ON DELETE SET NULL does not touch rows about to go.
    tx.execute("DELETE FROM tasks WHERE deleted_at IS NOT NULL", [])?;
    tx.execute("DELETE FROM notes WHERE deleted_at IS NOT NULL", [])?;
    Ok(changes)
}
