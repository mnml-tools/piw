//! Spaces: user-defined areas (e.g. Work, Personal). "All" is a UI filter, not a space.

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};

use super::{ORDER_STEP, next_order, unique_violation};
use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::{ColorName, Space};
use crate::domain::text::require_name;
use crate::domain::{new_id, time::now};
use crate::error::{AppError, AppResult};

const COLUMNS: &str = "id, name, color, sort_order, is_default, created_at, updated_at";
const DUPLICATE: &str = "A space with that name already exists";

fn map(row: &Row<'_>) -> rusqlite::Result<Space> {
    Ok(Space {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        sort_order: row.get(3)?,
        is_default: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

/// Creates the initial spaces on first run. Returns true when it seeded.
pub fn ensure_seeded(tx: &Transaction<'_>) -> AppResult<bool> {
    let count: i64 = tx.query_row("SELECT count(*) FROM spaces", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(false);
    }
    let ts = now();
    for (index, (name, color, default)) in [
        ("Work", ColorName::Sky, true),
        ("Personal", ColorName::Mint, false),
    ]
    .into_iter()
    .enumerate()
    {
        let order = i64::try_from(index).unwrap_or(0) * ORDER_STEP;
        tx.execute(
            "INSERT INTO spaces (id, name, color, sort_order, is_default, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![new_id(), name, color, order, default, ts],
        )?;
    }
    Ok(true)
}

pub fn list(conn: &Connection) -> AppResult<Vec<Space>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT {COLUMNS} FROM spaces ORDER BY sort_order, created_at"
    ))?;
    let rows = stmt.query_map([], map)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Space> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM spaces WHERE id = ?1"),
        [id],
        map,
    )
    .optional()?
    .ok_or(AppError::NotFound { entity: "space" })
}

pub fn default_space_id(conn: &Connection) -> AppResult<String> {
    conn.query_row(
        "SELECT id FROM spaces ORDER BY is_default DESC, sort_order LIMIT 1",
        [],
        |r| r.get(0),
    )
    .optional()?
    .ok_or(AppError::NotFound { entity: "space" })
}

pub fn create(
    tx: &Transaction<'_>,
    name: &str,
    color: Option<ColorName>,
) -> AppResult<(Space, ChangeSet)> {
    let name = require_name(name, "Space name", 80)?;
    let id = new_id();
    let ts = now();
    let order = next_order(tx, "SELECT max(sort_order) FROM spaces", [])?;
    tx.execute(
        "INSERT INTO spaces (id, name, color, sort_order, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?5)",
        params![id, name, color, order, ts],
    )
    .map_err(|e| unique_violation(e, DUPLICATE))?;
    Ok((get(tx, &id)?, ChangeSet::new().with(EntityKind::Space, id)))
}

pub fn rename(tx: &Transaction<'_>, id: &str, name: &str) -> AppResult<(Space, ChangeSet)> {
    let name = require_name(name, "Space name", 80)?;
    let changed = tx
        .execute(
            "UPDATE spaces SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![name, now(), id],
        )
        .map_err(|e| unique_violation(e, DUPLICATE))?;
    if changed == 0 {
        return Err(AppError::NotFound { entity: "space" });
    }
    Ok((get(tx, id)?, ChangeSet::new().with(EntityKind::Space, id)))
}

pub fn set_color(
    tx: &Transaction<'_>,
    id: &str,
    color: Option<ColorName>,
) -> AppResult<(Space, ChangeSet)> {
    let changed = tx.execute(
        "UPDATE spaces SET color = ?1, updated_at = ?2 WHERE id = ?3",
        params![color, now(), id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound { entity: "space" });
    }
    Ok((get(tx, id)?, ChangeSet::new().with(EntityKind::Space, id)))
}

pub fn set_default(tx: &Transaction<'_>, id: &str) -> AppResult<ChangeSet> {
    get(tx, id)?;
    let ts = now();
    tx.execute(
        "UPDATE spaces SET is_default = 0, updated_at = ?1 WHERE is_default = 1",
        [&ts],
    )?;
    tx.execute(
        "UPDATE spaces SET is_default = 1, updated_at = ?1 WHERE id = ?2",
        params![ts, id],
    )?;
    Ok(ChangeSet::new().with(EntityKind::Space, id))
}

/// Number of items (including archived and trashed) that would move with a space deletion.
pub fn item_count(conn: &Connection, id: &str) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT (SELECT count(*) FROM notes WHERE space_id = ?1)
              + (SELECT count(*) FROM tasks WHERE space_id = ?1)",
        [id],
        |r| r.get(0),
    )?)
}

/// Deletes a space after moving every item it holds into `move_to`.
pub fn delete(tx: &Transaction<'_>, id: &str, move_to: &str) -> AppResult<ChangeSet> {
    if id == move_to {
        return Err(AppError::validation("choose another space for the items"));
    }
    let space = get(tx, id)?;
    get(tx, move_to)?;
    let ts = now();
    let mut changes = ChangeSet::new()
        .with(EntityKind::Space, id)
        .with(EntityKind::Space, move_to);
    for (table, kind) in [("notes", EntityKind::Note), ("tasks", EntityKind::Task)] {
        let mut stmt = tx.prepare(&format!("SELECT id FROM {table} WHERE space_id = ?1"))?;
        let ids: Vec<String> = stmt
            .query_map([id], |r| r.get(0))?
            .collect::<Result<_, _>>()?;
        for item in ids {
            changes.add(kind, item);
        }
        tx.execute(
            &format!("UPDATE {table} SET space_id = ?1, updated_at = ?2 WHERE space_id = ?3"),
            params![move_to, ts, id],
        )?;
    }
    tx.execute("DELETE FROM spaces WHERE id = ?1", [id])?;
    if space.is_default {
        tx.execute(
            "UPDATE spaces SET is_default = 1, updated_at = ?1 WHERE id = ?2",
            params![ts, move_to],
        )?;
    }
    Ok(changes)
}
