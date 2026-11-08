//! Pinned items and their sticky windows (plan §3.7). A row in `sticky_windows` means the item is
//! pinned (listed in Pinned); `is_open` says whether its window is on the desktop. "Pin", "Keep on
//! top", "Hide" and "Remove" are four distinct operations (docs/ui-design-system.md §17 rule 9).

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::Serialize;
use ts_rs::TS;

use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::ColorName;
use crate::domain::time::now;
use crate::error::{AppError, AppResult};
use crate::platform::labels::{StickyKind, StickyTarget};
use crate::platform::window::{STICKY_DEFAULT_HEIGHT, STICKY_DEFAULT_WIDTH, StickyPlacement};

/// A pinned item with what the Pinned view and sticky windows need to show it.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct PinnedItem {
    pub target: StickyTarget,
    pub title: String,
    /// Document a task or tasks tab belongs to.
    pub document_title: Option<String>,
    pub space_id: String,
    pub is_open: bool,
    pub always_on_top: bool,
    pub color: Option<ColorName>,
    pub completed: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct StickyRecord {
    pub placement: StickyPlacement,
    pub color: Option<ColorName>,
    pub is_open: bool,
}

fn kind_str(kind: StickyKind) -> &'static str {
    match kind {
        StickyKind::Note => "note",
        StickyKind::Task => "task",
        StickyKind::TasksTab => "tasks_tab",
    }
}

fn parse_kind(value: &str) -> Option<StickyKind> {
    match value {
        "note" => Some(StickyKind::Note),
        "task" => Some(StickyKind::Task),
        "tasks_tab" => Some(StickyKind::TasksTab),
        _ => None,
    }
}

/// Checks that the target exists and is not in Trash; returns the entity kind to notify.
fn live_target(conn: &Connection, target: &StickyTarget) -> AppResult<()> {
    let sql = match target.kind {
        StickyKind::Note => {
            "SELECT 1 FROM notes WHERE id = ?1 AND deleted_at IS NULL AND kind = 'quick_note'"
        }
        StickyKind::Task => "SELECT 1 FROM tasks WHERE id = ?1 AND deleted_at IS NULL",
        StickyKind::TasksTab => {
            "SELECT 1 FROM document_tabs t JOIN notes d ON d.id = t.document_id
             WHERE t.id = ?1 AND t.kind = 'tasks' AND t.deleted_at IS NULL AND d.deleted_at IS NULL"
        }
    };
    conn.query_row(sql, [&target.id], |_| Ok(()))
        .optional()?
        .ok_or(AppError::NotFound { entity: "item" })
}

fn changes(target: &StickyTarget) -> ChangeSet {
    let kind = match target.kind {
        StickyKind::Note => EntityKind::Note,
        StickyKind::Task => EntityKind::Task,
        StickyKind::TasksTab => EntityKind::Tab,
    };
    ChangeSet::new()
        .with(kind, target.id.clone())
        .with(EntityKind::Sticky, target.label())
}

fn map_record(row: &Row<'_>) -> rusqlite::Result<StickyRecord> {
    Ok(StickyRecord {
        placement: StickyPlacement {
            x: row.get(0)?,
            y: row.get(1)?,
            width: row.get(2)?,
            height: row.get(3)?,
            always_on_top: row.get(4)?,
        },
        color: row.get(5)?,
        is_open: row.get(6)?,
    })
}

pub fn get(conn: &Connection, target: &StickyTarget) -> AppResult<Option<StickyRecord>> {
    Ok(conn
        .query_row(
            "SELECT x, y, width, height, always_on_top, color, is_open FROM sticky_windows
             WHERE target_kind = ?1 AND target_id = ?2",
            params![kind_str(target.kind), target.id],
            map_record,
        )
        .optional()?)
}

/// Pins an item (or reopens a pinned one). Returns where its window should go.
pub fn pin(tx: &Transaction<'_>, target: &StickyTarget) -> AppResult<(StickyRecord, ChangeSet)> {
    live_target(tx, target)?;
    let ts = now();
    tx.execute(
        "INSERT INTO sticky_windows (target_kind, target_id, width, height, is_open, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
         ON CONFLICT (target_kind, target_id) DO UPDATE SET is_open = 1, updated_at = excluded.updated_at",
        params![kind_str(target.kind), target.id, STICKY_DEFAULT_WIDTH, STICKY_DEFAULT_HEIGHT, ts],
    )?;
    let record = get(tx, target)?.ok_or(AppError::NotFound { entity: "sticky" })?;
    Ok((record, changes(target)))
}

/// Hides the window but keeps the item pinned (it stays in Pinned).
pub fn set_open(tx: &Transaction<'_>, target: &StickyTarget, open: bool) -> AppResult<ChangeSet> {
    tx.execute(
        "UPDATE sticky_windows SET is_open = ?1, updated_at = ?2 WHERE target_kind = ?3 AND target_id = ?4",
        params![open, now(), kind_str(target.kind), target.id],
    )?;
    Ok(changes(target))
}

/// Removes the item from the desktop and from Pinned (the item itself is untouched).
pub fn unpin(tx: &Transaction<'_>, target: &StickyTarget) -> AppResult<ChangeSet> {
    tx.execute(
        "DELETE FROM sticky_windows WHERE target_kind = ?1 AND target_id = ?2",
        params![kind_str(target.kind), target.id],
    )?;
    Ok(changes(target))
}

pub fn save_geometry(
    tx: &Transaction<'_>,
    target: &StickyTarget,
    placement: &StickyPlacement,
) -> AppResult<()> {
    if !(placement.width > 0.0 && placement.height > 0.0) {
        return Err(AppError::validation("sticky size must be positive"));
    }
    tx.execute(
        "UPDATE sticky_windows SET x = ?1, y = ?2, width = ?3, height = ?4, updated_at = ?5
         WHERE target_kind = ?6 AND target_id = ?7",
        params![
            placement.x,
            placement.y,
            placement.width,
            placement.height,
            now(),
            kind_str(target.kind),
            target.id
        ],
    )?;
    Ok(())
}

pub fn set_always_on_top(
    tx: &Transaction<'_>,
    target: &StickyTarget,
    enabled: bool,
) -> AppResult<ChangeSet> {
    tx.execute(
        "UPDATE sticky_windows SET always_on_top = ?1, updated_at = ?2 WHERE target_kind = ?3 AND target_id = ?4",
        params![enabled, now(), kind_str(target.kind), target.id],
    )?;
    Ok(changes(target))
}

pub fn set_color(
    tx: &Transaction<'_>,
    target: &StickyTarget,
    color: Option<ColorName>,
) -> AppResult<ChangeSet> {
    tx.execute(
        "UPDATE sticky_windows SET color = ?1, updated_at = ?2 WHERE target_kind = ?3 AND target_id = ?4",
        params![color, now(), kind_str(target.kind), target.id],
    )?;
    Ok(changes(target))
}

/// Forgets saved positions (Settings › Stickies › "Reset positions"), e.g. after a monitor
/// setup change left windows somewhere unexpected.
pub fn reset_positions(tx: &Transaction<'_>) -> AppResult<ChangeSet> {
    tx.execute("UPDATE sticky_windows SET x = NULL, y = NULL", [])?;
    Ok(ChangeSet::new().with(EntityKind::Sticky, "*"))
}

/// Pinned items whose target still exists outside Trash, most recently touched first.
pub fn list(conn: &Connection, space_id: Option<&str>) -> AppResult<Vec<PinnedItem>> {
    let mut stmt = conn.prepare_cached(
        "SELECT s.target_kind, s.target_id, s.is_open, s.always_on_top, s.color, s.updated_at,
                CASE s.target_kind
                  WHEN 'note' THEN n.title WHEN 'task' THEN k.title ELSE tab.title END,
                n.body,
                CASE s.target_kind WHEN 'task' THEN kd.title WHEN 'tasks_tab' THEN td.title END,
                coalesce(n.space_id, k.space_id, td.space_id),
                coalesce(k.status = 'completed', 0)
           FROM sticky_windows s
           LEFT JOIN notes n ON s.target_kind = 'note' AND n.id = s.target_id AND n.deleted_at IS NULL
           LEFT JOIN tasks k ON s.target_kind = 'task' AND k.id = s.target_id AND k.deleted_at IS NULL
           LEFT JOIN notes kd ON kd.id = k.document_id
           LEFT JOIN document_tabs tab ON s.target_kind = 'tasks_tab' AND tab.id = s.target_id
                                     AND tab.deleted_at IS NULL
           LEFT JOIN notes td ON td.id = tab.document_id AND td.deleted_at IS NULL
          WHERE coalesce(n.id, k.id, td.id) IS NOT NULL
            AND (?1 IS NULL OR coalesce(n.space_id, k.space_id, td.space_id) = ?1)
          ORDER BY s.updated_at DESC",
    )?;
    let rows = stmt.query_map([space_id], |row| {
        let kind: String = row.get(0)?;
        let title: String = row.get::<_, Option<String>>(6)?.unwrap_or_default();
        let body: Option<String> = row.get(7)?;
        let Some(kind) = parse_kind(&kind) else {
            return Ok(None);
        };
        Ok(Some(PinnedItem {
            title: match kind {
                StickyKind::Note => crate::domain::text::display_title(&title, body.as_deref()),
                _ => title,
            },
            target: StickyTarget {
                kind,
                id: row.get(1)?,
            },
            is_open: row.get(2)?,
            always_on_top: row.get(3)?,
            color: row.get(4)?,
            updated_at: row.get(5)?,
            document_title: row.get(8)?,
            space_id: row.get(9)?,
            completed: row.get(10)?,
        }))
    })?;
    let mut items = Vec::new();
    for row in rows {
        if let Some(item) = row? {
            items.push(item);
        }
    }
    Ok(items)
}

/// Windows to reopen at startup (only used when the user enabled it).
pub fn open_on_launch(conn: &Connection) -> AppResult<Vec<(StickyTarget, StickyRecord)>> {
    Ok(list(conn, None)?
        .into_iter()
        .filter(|item| item.is_open)
        .filter_map(|item| {
            let record = get(conn, &item.target).ok().flatten()?;
            Some((item.target, record))
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::tasks::{self, CreateTask};
    use crate::services::test_support::db;

    fn task_target(db: &crate::storage::Database) -> StickyTarget {
        let task = db
            .write(|tx| {
                tasks::create(
                    tx,
                    CreateTask {
                        title: "Pinned task".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .0;
        StickyTarget {
            kind: StickyKind::Task,
            id: task.id,
        }
    }

    #[test]
    fn pin_hide_and_remove_are_distinct() {
        let db = db();
        let target = task_target(&db);
        let (record, _) = db.write(|tx| pin(tx, &target)).unwrap();
        assert!(record.is_open);
        assert_eq!(
            (record.placement.width, record.placement.height),
            (STICKY_DEFAULT_WIDTH, STICKY_DEFAULT_HEIGHT)
        );

        db.write(|tx| set_open(tx, &target, false)).unwrap();
        let pinned = db.read(|c| list(c, None)).unwrap();
        assert_eq!(pinned.len(), 1, "hidden stickies stay pinned");
        assert!(!pinned[0].is_open);

        db.write(|tx| unpin(tx, &target)).unwrap();
        assert!(db.read(|c| list(c, None)).unwrap().is_empty());
        assert!(
            db.read(|c| tasks::get(c, &target.id)).is_ok(),
            "the task itself is untouched"
        );
    }

    #[test]
    fn geometry_and_on_top_survive_a_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("piw.sqlite3");
        let target = {
            let db = crate::storage::Database::open(&path).unwrap();
            db.write(crate::services::spaces::ensure_seeded).unwrap();
            let target = task_target(&db);
            db.write(|tx| pin(tx, &target)).unwrap();
            let placement = StickyPlacement {
                x: Some(1200),
                y: Some(2300),
                width: 320.0,
                height: 240.0,
                always_on_top: false,
            };
            db.write(|tx| save_geometry(tx, &target, &placement))
                .unwrap();
            db.write(|tx| set_always_on_top(tx, &target, true)).unwrap();
            target
        };
        let db = crate::storage::Database::open(&path).unwrap();
        let restored = db.read(open_on_launch).unwrap();
        assert_eq!(restored.len(), 1);
        let (restored_target, record) = &restored[0];
        assert_eq!(restored_target, &target);
        assert_eq!(
            record.placement,
            StickyPlacement {
                x: Some(1200),
                y: Some(2300),
                width: 320.0,
                height: 240.0,
                always_on_top: true
            }
        );
    }

    #[test]
    fn trashed_or_missing_targets_cannot_be_pinned_and_disappear_from_pinned() {
        let db = db();
        let target = task_target(&db);
        db.write(|tx| pin(tx, &target)).unwrap();
        db.write(|tx| tasks::trash(tx, &target.id)).unwrap();
        assert!(db.read(|c| list(c, None)).unwrap().is_empty());
        assert!(db.write(|tx| pin(tx, &target)).is_err());
        // Restoring brings it back to Pinned, still marked open.
        db.write(|tx| tasks::restore(tx, &target.id)).unwrap();
        assert!(db.read(|c| list(c, None)).unwrap()[0].is_open);
        // Purging removes the sticky row too (trigger).
        db.write(|tx| tasks::trash(tx, &target.id)).unwrap();
        db.write(|tx| tasks::purge(tx, &target.id)).unwrap();
        assert!(db.read(|c| get(c, &target)).unwrap().is_none());
        let missing = StickyTarget {
            kind: StickyKind::Note,
            id: "nope".into(),
        };
        assert!(db.write(|tx| pin(tx, &missing)).is_err());
    }

    #[test]
    fn task_flags_reflect_pinning() {
        let db = db();
        let target = task_target(&db);
        db.write(|tx| pin(tx, &target)).unwrap();
        assert!(db.read(|c| tasks::get(c, &target.id)).unwrap().pinned);
    }

    #[test]
    fn reset_positions_forgets_coordinates_only() {
        let db = db();
        let target = task_target(&db);
        db.write(|tx| pin(tx, &target)).unwrap();
        let placement = StickyPlacement {
            x: Some(10),
            y: Some(10),
            width: 300.0,
            height: 200.0,
            always_on_top: false,
        };
        db.write(|tx| save_geometry(tx, &target, &placement))
            .unwrap();
        db.write(reset_positions).unwrap();
        let record = db.read(|c| get(c, &target)).unwrap().unwrap();
        assert_eq!((record.placement.x, record.placement.width), (None, 300.0));
    }
}
