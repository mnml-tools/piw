//! Business operations. Each mutating function runs inside the caller's transaction and returns
//! the [`ChangeSet`](crate::domain::change::ChangeSet) to broadcast after commit. Services are
//! plain functions over `rusqlite` so they can be tested without Tauri.

pub mod documents;
pub mod drafts;
pub mod export;
pub mod inbox;
pub mod notes;
pub mod search;
pub mod settings;
pub mod spaces;
pub mod stickies;
pub mod tags;
pub mod tasks;
pub mod trash;

#[cfg(test)]
mod bench;
#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod tests;

use rusqlite::{Connection, OptionalExtension, params};

use crate::error::{AppError, AppResult};

/// Gap between consecutive `sort_order` values, leaving room for future insertions.
pub const ORDER_STEP: i64 = 1024;

/// Separator used by `group_concat` for tag lists (ASCII unit separator).
pub(crate) const LIST_SEPARATOR: char = '\u{1f}';

pub(crate) fn split_list(value: Option<String>) -> Vec<String> {
    value
        .map(|v| {
            let mut items: Vec<String> = v.split(LIST_SEPARATOR).map(str::to_owned).collect();
            items.sort_by_key(|s| s.to_lowercase());
            items
        })
        .unwrap_or_default()
}

/// Returns `space_id` after checking it exists, or the default space when `None`.
pub(crate) fn resolve_space(conn: &Connection, space_id: Option<&str>) -> AppResult<String> {
    match space_id {
        Some(id) => {
            let found: Option<String> = conn
                .query_row("SELECT id FROM spaces WHERE id = ?1", [id], |r| r.get(0))
                .optional()?;
            found.ok_or(AppError::NotFound { entity: "space" })
        }
        None => spaces::default_space_id(conn),
    }
}

/// Next `sort_order` at the end of the rows matched by `scope_sql` (a full SELECT of MAX()).
pub(crate) fn next_order(
    conn: &Connection,
    scope_sql: &str,
    params: impl rusqlite::Params,
) -> AppResult<i64> {
    let max: Option<i64> = conn.query_row(scope_sql, params, |r| r.get(0))?;
    Ok(max.map_or(0, |m| m + ORDER_STEP))
}

/// Applies `ids` order (0, STEP, 2·STEP…) to `table`. `ids` must be exactly `expected`.
pub(crate) fn apply_order(
    conn: &Connection,
    table: &str,
    ids: &[String],
    expected: &[String],
) -> AppResult<()> {
    let mut a: Vec<&String> = ids.iter().collect();
    let mut b: Vec<&String> = expected.iter().collect();
    a.sort();
    b.sort();
    a.dedup();
    if a.len() != ids.len() || a != b {
        return Err(AppError::validation(
            "the new order must contain exactly the current items",
        ));
    }
    let sql = format!("UPDATE {table} SET sort_order = ?1 WHERE id = ?2");
    let mut stmt = conn.prepare_cached(&sql)?;
    for (index, id) in ids.iter().enumerate() {
        let order = i64::try_from(index).unwrap_or(i64::MAX / ORDER_STEP) * ORDER_STEP;
        stmt.execute(params![order, id])?;
    }
    Ok(())
}

/// Maps a UNIQUE constraint failure to a friendly validation error.
pub(crate) fn unique_violation(error: rusqlite::Error, message: &str) -> AppError {
    if let rusqlite::Error::SqliteFailure(failure, _) = &error
        && failure.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
    {
        return AppError::validation(message);
    }
    error.into()
}
