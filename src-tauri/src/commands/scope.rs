//! Per-window data scope (defence in depth on top of capabilities): a sticky window may only
//! read and change the one item it shows. The workspace and capture windows are not limited
//! here (capture's capability already only allows creating items).

use rusqlite::{Connection, OptionalExtension};
use tauri::{Runtime, WebviewWindow};

use crate::error::{AppError, AppResult};
use crate::platform::labels::{StickyKind, StickyTarget};

/// What a command is about to touch.
#[derive(Debug, Clone, Copy)]
pub enum Access<'a> {
    Note(&'a str),
    Task(&'a str),
    /// Creating a task under a parent task and/or in a document.
    CreateTask {
        parent: Option<&'a str>,
        document: Option<&'a str>,
    },
    Document(&'a str),
    Tab(&'a str),
}

fn denied() -> AppError {
    AppError::validation("this window can only access its own item")
}

/// Document and parent of a task.
fn task_links(conn: &Connection, id: &str) -> AppResult<(Option<String>, Option<String>)> {
    Ok(conn
        .query_row(
            "SELECT document_id, parent_task_id FROM tasks WHERE id = ?1",
            [id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?
        .unwrap_or((None, None)))
}

fn tab_document(conn: &Connection, tab_id: &str) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT document_id FROM document_tabs WHERE id = ?1",
            [tab_id],
            |r| r.get(0),
        )
        .optional()?)
}

/// Checks `access` against the sticky target `target` (pure apart from the lookups).
pub fn allowed(conn: &Connection, target: &StickyTarget, access: Access<'_>) -> AppResult<bool> {
    Ok(match (target.kind, access) {
        (StickyKind::Note, Access::Note(id)) => id == target.id,
        (StickyKind::Task, Access::Task(id)) => {
            id == target.id || task_links(conn, id)?.1.as_deref() == Some(target.id.as_str())
        }
        (StickyKind::Task, Access::CreateTask { parent, .. }) => parent == Some(target.id.as_str()),
        (StickyKind::TasksTab, access) => {
            let Some(document) = tab_document(conn, &target.id)? else {
                return Ok(false);
            };
            match access {
                Access::Tab(id) => id == target.id,
                Access::Document(id) => id == document,
                Access::Task(id) => {
                    let (doc, parent) = task_links(conn, id)?;
                    let doc = match (doc, parent) {
                        (Some(doc), _) => Some(doc),
                        (None, Some(parent)) => task_links(conn, &parent)?.0,
                        (None, None) => None,
                    };
                    doc.as_deref() == Some(document.as_str())
                }
                Access::CreateTask {
                    parent: None,
                    document: Some(doc),
                } => doc == document,
                _ => false,
            }
        }
        _ => false,
    })
}

/// Rejects the call if it comes from a sticky window and touches something else.
pub fn check<R: Runtime>(
    conn: &Connection,
    window: &WebviewWindow<R>,
    access: Access<'_>,
) -> AppResult<()> {
    match StickyTarget::from_label(window.label()) {
        Some(target) if !allowed(conn, &target, access)? => Err(denied()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::documents::{self, CreateDocument};
    use crate::services::tasks::{self, CreateTask};
    use crate::services::test_support::db;

    #[test]
    fn stickies_only_reach_their_own_item() {
        let db = db();
        let (doc, _) = db
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
        let (tab, _) = db
            .write(|tx| {
                documents::create_tab(
                    tx,
                    &doc.note.id,
                    crate::domain::model::TabKind::Tasks,
                    "To-dos",
                )
            })
            .unwrap();
        let in_doc = db
            .write(|tx| {
                tasks::create(
                    tx,
                    CreateTask {
                        title: "a".into(),
                        document_id: Some(doc.note.id.clone()),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .0;
        let sub = db
            .write(|tx| {
                tasks::create(
                    tx,
                    CreateTask {
                        title: "s".into(),
                        parent_task_id: Some(in_doc.id.clone()),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .0;
        let other = db
            .write(|tx| {
                tasks::create(
                    tx,
                    CreateTask {
                        title: "b".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .0;

        let task_sticky = StickyTarget {
            kind: StickyKind::Task,
            id: in_doc.id.clone(),
        };
        let tab_sticky = StickyTarget {
            kind: StickyKind::TasksTab,
            id: tab.id.clone(),
        };
        let note_sticky = StickyTarget {
            kind: StickyKind::Note,
            id: "n1".into(),
        };
        db.read(|c| {
            assert!(allowed(c, &task_sticky, Access::Task(&in_doc.id))?);
            assert!(
                allowed(c, &task_sticky, Access::Task(&sub.id))?,
                "its subtasks"
            );
            assert!(!allowed(c, &task_sticky, Access::Task(&other.id))?);
            assert!(allowed(
                c,
                &task_sticky,
                Access::CreateTask {
                    parent: Some(&in_doc.id),
                    document: None
                }
            )?);
            assert!(!allowed(
                c,
                &task_sticky,
                Access::CreateTask {
                    parent: None,
                    document: None
                }
            )?);
            assert!(allowed(c, &tab_sticky, Access::Task(&in_doc.id))?);
            assert!(allowed(c, &tab_sticky, Access::Task(&sub.id))?);
            assert!(!allowed(c, &tab_sticky, Access::Task(&other.id))?);
            assert!(allowed(c, &tab_sticky, Access::Document(&doc.note.id))?);
            assert!(allowed(
                c,
                &tab_sticky,
                Access::CreateTask {
                    parent: None,
                    document: Some(&doc.note.id)
                }
            )?);
            assert!(!allowed(c, &tab_sticky, Access::Note("n1"))?);
            assert!(allowed(c, &note_sticky, Access::Note("n1"))?);
            assert!(!allowed(c, &note_sticky, Access::Note("n2"))?);
            assert!(!allowed(c, &note_sticky, Access::Task(&other.id))?);
            Ok(())
        })
        .unwrap();
    }
}
