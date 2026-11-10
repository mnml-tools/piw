//! What a vault sticky shows (docs/redesign.md, phase 4): a note by its vault path, or a task
//! view with its space filter. The window itself is a row of `sticky_windows`, like every other
//! sticky; this table only maps its id to the vault. Both live in Piw's data directory, so a
//! synced vault never moves windows on another computer.

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::new_id;
use crate::error::{AppError, AppResult};
use crate::platform::labels::{StickyKind, StickyTarget};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultStickyItem {
    Note { path: String },
    Tasks { view: String, space: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultPinned {
    pub target: StickyTarget,
    pub item: VaultStickyItem,
    pub is_open: bool,
}

const VIEWS: [&str; 3] = ["today", "upcoming", "all"];

/// The sticky for `item` in the vault at `root`, created (not yet pinned) if there is none.
pub fn target_for(
    tx: &Transaction<'_>,
    root: &str,
    item: &VaultStickyItem,
) -> AppResult<StickyTarget> {
    let found: Option<(String, String)> = match item {
        VaultStickyItem::Note { path } => tx
            .query_row(
                "SELECT target_kind, target_id FROM vault_stickies
                 WHERE vault_root = ?1 AND path = ?2",
                params![root, path],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?,
        VaultStickyItem::Tasks { view, space } => {
            if !VIEWS.contains(&view.as_str()) {
                return Err(AppError::validation("unknown task view"));
            }
            tx.query_row(
                "SELECT target_kind, target_id FROM vault_stickies
                 WHERE vault_root = ?1 AND view = ?2 AND coalesce(space, '') = coalesce(?3, '')",
                params![root, view, space],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
        }
    };
    let kind = match item {
        VaultStickyItem::Note { .. } => StickyKind::VaultNote,
        VaultStickyItem::Tasks { .. } => StickyKind::VaultTasks,
    };
    if let Some((_, id)) = found {
        return Ok(StickyTarget { kind, id });
    }
    let id = new_id();
    let (path, view, space) = match item {
        VaultStickyItem::Note { path } => (Some(path.as_str()), None, None),
        VaultStickyItem::Tasks { view, space } => (None, Some(view.as_str()), space.as_deref()),
    };
    tx.execute(
        "INSERT INTO vault_stickies (target_kind, target_id, vault_root, path, view, space)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            if path.is_some() {
                "vault_note"
            } else {
                "vault_tasks"
            },
            id,
            root,
            path,
            view,
            space
        ],
    )?;
    Ok(StickyTarget { kind, id })
}

fn kind_name(kind: StickyKind) -> Option<&'static str> {
    match kind {
        StickyKind::VaultNote => Some("vault_note"),
        StickyKind::VaultTasks => Some("vault_tasks"),
    }
}

fn item_of(path: Option<String>, view: Option<String>, space: Option<String>) -> VaultStickyItem {
    match (path, view) {
        (Some(path), _) => VaultStickyItem::Note { path },
        (None, view) => VaultStickyItem::Tasks {
            view: view.unwrap_or_else(|| "today".into()),
            space,
        },
    }
}

/// What a vault sticky shows, and in which vault; `None` for any other sticky.
pub fn item(
    conn: &Connection,
    target: &StickyTarget,
) -> AppResult<Option<(String, VaultStickyItem)>> {
    let Some(kind) = kind_name(target.kind) else {
        return Ok(None);
    };
    Ok(conn
        .query_row(
            "SELECT vault_root, path, view, space FROM vault_stickies
             WHERE target_kind = ?1 AND target_id = ?2",
            params![kind, target.id],
            |r| Ok((r.get(0)?, item_of(r.get(1)?, r.get(2)?, r.get(3)?))),
        )
        .optional()?)
}

/// Every pinned vault sticky of the vault at `root`.
pub fn pinned(conn: &Connection, root: &str) -> AppResult<Vec<VaultPinned>> {
    let mut stmt = conn.prepare(
        "SELECT v.target_kind, v.target_id, v.path, v.view, v.space, s.is_open
         FROM vault_stickies v
         JOIN sticky_windows s ON s.target_kind = v.target_kind AND s.target_id = v.target_id
         WHERE v.vault_root = ?1
         ORDER BY v.path, v.view",
    )?;
    let rows = stmt.query_map([root], |r| {
        let kind: String = r.get(0)?;
        Ok(VaultPinned {
            target: StickyTarget {
                kind: if kind == "vault_note" {
                    StickyKind::VaultNote
                } else {
                    StickyKind::VaultTasks
                },
                id: r.get(1)?,
            },
            item: item_of(r.get(2)?, r.get(3)?, r.get(4)?),
            is_open: r.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// A note or folder at `from` moved to `to`: the stickies of the notes under it follow.
pub fn renamed(tx: &Transaction<'_>, root: &str, from: &str, to: &str) -> AppResult<ChangeSet> {
    let mut stmt = tx.prepare(
        "SELECT target_id, path FROM vault_stickies
         WHERE vault_root = ?1 AND (path = ?2 OR substr(path, 1, length(?2) + 1) = ?2 || '/')",
    )?;
    let moved: Vec<(String, String)> = stmt
        .query_map(params![root, from], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut changes = ChangeSet::new();
    for (id, path) in moved {
        let next = format!("{to}{}", &path[from.len()..]);
        tx.execute(
            "UPDATE vault_stickies SET path = ?1 WHERE target_kind = 'vault_note' AND target_id = ?2",
            params![next, id],
        )?;
        let target = StickyTarget {
            kind: StickyKind::VaultNote,
            id,
        };
        changes.add(EntityKind::Sticky, target.label());
    }
    Ok(changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::stickies;
    use crate::services::test_support::db;

    fn note(path: &str) -> VaultStickyItem {
        VaultStickyItem::Note { path: path.into() }
    }

    #[test]
    fn one_sticky_per_note_or_view_that_follows_renames() {
        let db = db();
        let target = db
            .write(|tx| target_for(tx, "/vault", &note("Work/Plan.md")))
            .unwrap();
        assert_eq!(target.kind, StickyKind::VaultNote);
        let again = db
            .write(|tx| target_for(tx, "/vault", &note("Work/Plan.md")))
            .unwrap();
        assert_eq!(again, target);
        let other = db
            .write(|tx| target_for(tx, "/other", &note("Work/Plan.md")))
            .unwrap();
        assert_ne!(other, target, "another vault has its own stickies");

        db.write(|tx| stickies::pin(tx, &target)).unwrap();
        assert_eq!(db.read(|c| pinned(c, "/vault")).unwrap().len(), 1);
        db.write(|tx| renamed(tx, "/vault", "Work", "Job")).unwrap();
        assert_eq!(
            db.read(|c| item(c, &target)).unwrap(),
            Some(("/vault".into(), note("Job/Plan.md")))
        );

        let today = |space: Option<&str>| VaultStickyItem::Tasks {
            view: "today".into(),
            space: space.map(str::to_owned),
        };
        let all_spaces = db
            .write(|tx| target_for(tx, "/vault", &today(None)))
            .unwrap();
        let work = db
            .write(|tx| target_for(tx, "/vault", &today(Some("Work"))))
            .unwrap();
        assert_ne!(all_spaces, work);
        assert_eq!(
            db.write(|tx| target_for(tx, "/vault", &today(None)))
                .unwrap(),
            all_spaces
        );
        let bad = VaultStickyItem::Tasks {
            view: "someday".into(),
            space: None,
        };
        assert!(db.write(|tx| target_for(tx, "/vault", &bad)).is_err());

        // Unpinning forgets the mapping (trigger), so pinning again makes a new sticky.
        db.write(|tx| stickies::unpin(tx, &target)).unwrap();
        assert_eq!(db.read(|c| item(c, &target)).unwrap(), None);
    }

    #[test]
    fn open_vault_stickies_come_back_on_launch() {
        let db = db();
        let target = db
            .write(|tx| target_for(tx, "/vault", &note("Inbox.md")))
            .unwrap();
        db.write(|tx| stickies::pin(tx, &target)).unwrap();
        let open = db
            .read(|c| stickies::open_on_launch(c, Some("/vault")))
            .unwrap();
        assert_eq!(open.len(), 1);
        assert!(
            db.read(|c| stickies::open_on_launch(c, Some("/elsewhere")))
                .unwrap()
                .is_empty()
        );
        assert!(
            db.read(|c| stickies::open_on_launch(c, None))
                .unwrap()
                .is_empty()
        );
    }
}
