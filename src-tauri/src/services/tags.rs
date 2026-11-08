//! Tags: optional, flat, shared by notes, documents and tasks.

use rusqlite::{Connection, OptionalExtension, Transaction, params};

use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::Tag;
use crate::domain::text::normalize_tag;
use crate::domain::{new_id, time::now};
use crate::error::{AppError, AppResult};

pub fn list(conn: &Connection) -> AppResult<Vec<Tag>> {
    let mut stmt = conn.prepare_cached(
        "SELECT t.id, t.name,
                (SELECT count(*) FROM note_tags n WHERE n.tag_id = t.id)
              + (SELECT count(*) FROM task_tags k WHERE k.tag_id = t.id)
         FROM tags t ORDER BY t.name COLLATE NOCASE",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Tag {
            id: r.get(0)?,
            name: r.get(1)?,
            usage: r.get(2)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn tag_id(tx: &Transaction<'_>, name: &str) -> AppResult<String> {
    if let Some(id) = tx
        .query_row(
            "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
            [name],
            |r| r.get(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    let id = new_id();
    tx.execute(
        "INSERT INTO tags (id, name, created_at) VALUES (?1, ?2, ?3)",
        params![id, name, now()],
    )?;
    Ok(id)
}

#[derive(Debug, Clone, Copy)]
pub enum Tagged {
    Note,
    Task,
}

impl Tagged {
    fn table(self) -> (&'static str, &'static str, &'static str, EntityKind) {
        match self {
            Self::Note => ("note_tags", "note_id", "notes", EntityKind::Note),
            Self::Task => ("task_tags", "task_id", "tasks", EntityKind::Task),
        }
    }
}

/// Replaces the tags of a note or task. Tags no longer used anywhere are removed.
pub fn set(
    tx: &Transaction<'_>,
    target: Tagged,
    id: &str,
    names: &[String],
) -> AppResult<(Vec<String>, ChangeSet)> {
    let (join, column, owner, kind) = target.table();
    let exists: bool = tx.query_row(
        &format!("SELECT EXISTS (SELECT 1 FROM {owner} WHERE id = ?1)"),
        [id],
        |r| r.get(0),
    )?;
    if !exists {
        return Err(AppError::NotFound { entity: "item" });
    }
    let mut normalized: Vec<String> = Vec::new();
    for name in names {
        let tag = normalize_tag(name)?;
        if !normalized.iter().any(|n| n.eq_ignore_ascii_case(&tag)) {
            normalized.push(tag);
        }
    }
    if normalized.len() > 20 {
        return Err(AppError::validation("an item can have at most 20 tags"));
    }
    tx.execute(&format!("DELETE FROM {join} WHERE {column} = ?1"), [id])?;
    for name in &normalized {
        let tag = tag_id(tx, name)?;
        tx.execute(
            &format!("INSERT OR IGNORE INTO {join} ({column}, tag_id) VALUES (?1, ?2)"),
            params![id, tag],
        )?;
    }
    tx.execute(
        "DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = tags.id)
                            AND NOT EXISTS (SELECT 1 FROM task_tags WHERE tag_id = tags.id)",
        [],
    )?;
    tx.execute(
        &format!("UPDATE {owner} SET updated_at = ?1 WHERE id = ?2"),
        params![now(), id],
    )?;
    normalized.sort_by_key(|n| n.to_lowercase());
    Ok((
        normalized,
        ChangeSet::new().with(kind, id).with(EntityKind::Tag, "*"),
    ))
}
