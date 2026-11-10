//! Sticky windows (docs/ui-design-system.md §12): a row in `sticky_windows` means the item is
//! pinned; `is_open` says whether its window is on the desktop. "Pin", "Keep on top", "Hide" and
//! "Remove" are four distinct operations (docs/ui-design-system.md §17 rule 9). What a vault
//! sticky shows is in `vault_stickies` (`services/vault_stickies.rs`).

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::Serialize;
use ts_rs::TS;

use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::ColorName;
use crate::domain::time::now;
use crate::error::{AppError, AppResult};
use crate::platform::labels::{StickyKind, StickyTarget};
use crate::platform::window::{STICKY_DEFAULT_HEIGHT, STICKY_DEFAULT_WIDTH, StickyPlacement};

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
        StickyKind::VaultNote => "vault_note",
        StickyKind::VaultTasks => "vault_tasks",
    }
}

/// Checks that the sticky knows what it shows.
fn live_target(conn: &Connection, target: &StickyTarget) -> AppResult<()> {
    conn.query_row(
        "SELECT 1 FROM vault_stickies WHERE target_kind = ?1 AND target_id = ?2",
        params![kind_str(target.kind), target.id],
        |_| Ok(()),
    )
    .optional()?
    .ok_or(AppError::NotFound { entity: "item" })
}

fn changes(target: &StickyTarget) -> ChangeSet {
    ChangeSet::new().with(EntityKind::Sticky, target.label())
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

/// Windows to reopen at startup (only used when the user enabled it): the open stickies of the
/// vault at `vault_root`.
pub fn open_on_launch(
    conn: &Connection,
    vault_root: Option<&str>,
) -> AppResult<Vec<(StickyTarget, StickyRecord)>> {
    let Some(root) = vault_root else {
        return Ok(Vec::new());
    };
    Ok(super::vault_stickies::pinned(conn, root)?
        .into_iter()
        .filter(|pinned| pinned.is_open)
        .filter_map(|pinned| {
            let record = get(conn, &pinned.target).ok().flatten()?;
            Some((pinned.target, record))
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::test_support::db;
    use crate::services::vault_stickies::{VaultStickyItem, target_for};

    fn note_target(db: &crate::storage::Database) -> StickyTarget {
        let item = VaultStickyItem::Note {
            path: "Work/Plan.md".into(),
        };
        db.write(|tx| target_for(tx, "/vault", &item)).unwrap()
    }

    #[test]
    fn pin_hide_and_remove_are_distinct() {
        let db = db();
        let target = note_target(&db);
        let (record, _) = db.write(|tx| pin(tx, &target)).unwrap();
        assert!(record.is_open);
        assert_eq!(
            (record.placement.width, record.placement.height),
            (STICKY_DEFAULT_WIDTH, STICKY_DEFAULT_HEIGHT)
        );
        db.write(|tx| set_open(tx, &target, false)).unwrap();
        assert!(
            !db.read(|c| get(c, &target)).unwrap().unwrap().is_open,
            "hidden stays pinned"
        );
        db.write(|tx| unpin(tx, &target)).unwrap();
        assert!(db.read(|c| get(c, &target)).unwrap().is_none());
        assert!(
            db.write(|tx| pin(tx, &target)).is_err(),
            "unpinning forgets what it showed"
        );
    }

    #[test]
    fn geometry_colour_and_on_top_survive_a_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("piw.sqlite3");
        let target = {
            let db = crate::storage::Database::open(&path).unwrap();
            let target = note_target(&db);
            db.write(|tx| pin(tx, &target)).unwrap();
            let placement = StickyPlacement {
                x: Some(40),
                y: Some(80),
                width: 320.0,
                height: 240.0,
                always_on_top: false,
            };
            db.write(|tx| save_geometry(tx, &target, &placement))
                .unwrap();
            db.write(|tx| set_always_on_top(tx, &target, true)).unwrap();
            db.write(|tx| set_color(tx, &target, Some(ColorName::Mint)))
                .unwrap();
            target
        };
        let db = crate::storage::Database::open(&path).unwrap();
        let restored = db.read(|c| open_on_launch(c, Some("/vault"))).unwrap();
        assert_eq!(restored.len(), 1);
        let (restored_target, record) = &restored[0];
        assert_eq!(restored_target, &target);
        assert_eq!(
            (record.placement.x, record.placement.y),
            (Some(40), Some(80))
        );
        assert!(record.placement.always_on_top);
        assert_eq!(record.color, Some(ColorName::Mint));
        db.write(reset_positions).unwrap();
        assert_eq!(
            db.read(|c| get(c, &target)).unwrap().unwrap().placement.x,
            None
        );
    }
}
