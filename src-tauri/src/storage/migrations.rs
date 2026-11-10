//! Versioned schema migrations tracked with `PRAGMA user_version`.
//!
//! Each migration runs in its own transaction together with the version bump, so a crash
//! leaves the database at the previous version. Before upgrading an existing file, a
//! consistent copy is written next to it (`VACUUM INTO`).

use std::path::Path;

use rusqlite::{Connection, TransactionBehavior};

use crate::error::{AppError, AppResult};

const MIGRATIONS: &[(&str, &str)] = &[
    (
        "0001_initial",
        include_str!("../../migrations/0001_initial.sql"),
    ),
    (
        "0002_task_sections",
        include_str!("../../migrations/0002_task_sections.sql"),
    ),
    (
        "0003_vault_stickies",
        include_str!("../../migrations/0003_vault_stickies.sql"),
    ),
];

/// Schema version this build expects.
pub const SCHEMA_VERSION: u32 = MIGRATIONS.len() as u32;

pub fn current_version(conn: &Connection) -> AppResult<u32> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
}

/// Applies pending migrations. `path` enables the pre-upgrade backup for file databases.
pub fn migrate(conn: &mut Connection, path: Option<&Path>) -> AppResult<()> {
    migrate_with(conn, path, MIGRATIONS)
}

fn migrate_with(
    conn: &mut Connection,
    path: Option<&Path>,
    migrations: &[(&str, &str)],
) -> AppResult<()> {
    let current = current_version(conn)?;
    let target = u32::try_from(migrations.len()).unwrap_or(u32::MAX);
    if current > target {
        // Never touch a database written by a newer Piw: data could be lost.
        return Err(AppError::Storage(format!(
            "the database uses schema version {current}, but this version of Piw only supports \
             up to {target}; please update Piw"
        )));
    }
    if current == target {
        return Ok(());
    }
    if current > 0
        && let Some(path) = path
    {
        backup_before_upgrade(conn, path, current)?;
    }
    for (index, (name, sql)) in migrations.iter().enumerate().skip(current as usize) {
        let version = u32::try_from(index + 1).unwrap_or(u32::MAX);
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        tx.execute_batch(sql)
            .map_err(|e| AppError::Storage(format!("migration {name} failed: {e}")))?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
        log::info!("applied migration {name}");
    }
    Ok(())
}

fn backup_before_upgrade(conn: &Connection, path: &Path, version: u32) -> AppResult<()> {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "piw.sqlite3".into());
    let backup = path.with_file_name(format!("{file_name}.v{version}.bak"));
    if backup.exists() {
        return Ok(());
    }
    let target = backup.to_string_lossy().into_owned();
    conn.execute("VACUUM INTO ?1", [target])?;
    log::info!("backed up schema v{version} before upgrading");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fresh() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        conn
    }

    #[test]
    fn migrates_an_empty_database_to_the_latest_version() {
        let mut conn = fresh();
        migrate(&mut conn, None).unwrap();
        assert_eq!(current_version(&conn).unwrap(), SCHEMA_VERSION);
        // Idempotent.
        migrate(&mut conn, None).unwrap();
        let fts: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'search_index'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(fts, 1);
    }

    #[test]
    fn upgrades_v1_data_to_task_sections_and_keeps_stickies() {
        let mut conn = fresh();
        migrate_with(&mut conn, None, &MIGRATIONS[..1]).unwrap();
        conn.execute_batch(
            "INSERT INTO spaces (id, name, sort_order, is_default, created_at, updated_at)
                  VALUES ('s1', 'Work', 0, 1, 't', 't');
             INSERT INTO tasks (id, space_id, title, sort_order, created_at, updated_at)
                  VALUES ('t1', 's1', 'Keep me', 0, 't', 't');
             INSERT INTO sticky_windows (target_kind, target_id, width, height, created_at, updated_at)
                  VALUES ('task', 't1', 300, 260, 't', 't');",
        )
        .unwrap();
        migrate(&mut conn, None).unwrap();
        assert_eq!(current_version(&conn).unwrap(), SCHEMA_VERSION);
        let section: Option<String> = conn
            .query_row("SELECT section_id FROM tasks WHERE id = 't1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(section, None);
        conn.execute_batch(
            "INSERT INTO sticky_windows (target_kind, target_id, width, height, created_at, updated_at)
                  VALUES ('section', 'x', 300, 260, 't', 't');
             DELETE FROM tasks WHERE id = 't1';",
        )
        .unwrap();
        let kinds: Vec<String> = conn
            .prepare("SELECT target_kind FROM sticky_windows ORDER BY target_kind")
            .unwrap()
            .query_map([], |r| r.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(kinds, ["section"], "the task sticky went with its task");
    }

    #[test]
    fn upgrades_v2_stickies_and_accepts_vault_stickies() {
        let mut conn = fresh();
        migrate_with(&mut conn, None, &MIGRATIONS[..2]).unwrap();
        conn.execute_batch(
            "INSERT INTO spaces (id, name, sort_order, is_default, created_at, updated_at)
                  VALUES ('s1', 'Work', 0, 1, 't', 't');
             INSERT INTO task_sections (id, space_id, title, sort_order, created_at, updated_at)
                  VALUES ('x', 's1', 'Atlas', 0, 't', 't');
             INSERT INTO sticky_windows (target_kind, target_id, width, height, color, created_at, updated_at)
                  VALUES ('section', 'x', 300, 260, 'mint', 't', 't');",
        )
        .unwrap();
        migrate(&mut conn, None).unwrap();
        assert_eq!(current_version(&conn).unwrap(), SCHEMA_VERSION);
        let color: String = conn
            .query_row(
                "SELECT color FROM sticky_windows WHERE target_id = 'x'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(color, "mint", "existing stickies keep their state");
        conn.execute_batch(
            "INSERT INTO vault_stickies (target_kind, target_id, vault_root, path)
                  VALUES ('vault_note', 'v1', '/vault', 'Work/Inbox.md');
             INSERT INTO sticky_windows (target_kind, target_id, width, height, created_at, updated_at)
                  VALUES ('vault_note', 'v1', 300, 260, 't', 't');",
        )
        .unwrap();
        let duplicate = conn.execute(
            "INSERT INTO vault_stickies (target_kind, target_id, vault_root, path)
                  VALUES ('vault_note', 'v2', '/vault', 'Work/Inbox.md')",
            [],
        );
        assert!(duplicate.is_err(), "one sticky per note");
        conn.execute_batch(
            "DELETE FROM sticky_windows WHERE target_id = 'v1';
             DELETE FROM task_sections WHERE id = 'x';",
        )
        .unwrap();
        let left: i64 = conn
            .query_row(
                "SELECT (SELECT count(*) FROM vault_stickies) + (SELECT count(*) FROM sticky_windows)",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            left, 0,
            "unpinning forgets the mapping; the section trigger still works"
        );
    }

    #[test]
    fn refuses_a_database_from_a_newer_version() {
        let mut conn = fresh();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        let error = migrate(&mut conn, None).unwrap_err();
        assert!(error.to_string().contains("please update Piw"));
    }

    #[test]
    fn a_failing_migration_rolls_back_and_keeps_the_version() {
        let mut conn = fresh();
        let broken: &[(&str, &str)] = &[
            ("0001_ok", "CREATE TABLE a (x INTEGER);"),
            (
                "0002_broken",
                "CREATE TABLE b (x INTEGER); THIS IS NOT SQL;",
            ),
        ];
        assert!(migrate_with(&mut conn, None, broken).is_err());
        assert_eq!(current_version(&conn).unwrap(), 1);
        let b_exists: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'b'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(b_exists, 0, "partial migration must be rolled back");
    }

    #[test]
    fn upgrades_a_file_database_and_keeps_a_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("piw.sqlite3");
        let v1: &[(&str, &str)] = &[(
            "0001",
            "CREATE TABLE a (x TEXT); INSERT INTO a VALUES ('café ☕');",
        )];
        let v2: &[(&str, &str)] = &[
            v1[0],
            ("0002", "ALTER TABLE a ADD COLUMN y INTEGER DEFAULT 7;"),
        ];
        {
            let mut conn = Connection::open(&path).unwrap();
            migrate_with(&mut conn, Some(&path), v1).unwrap();
        }
        let mut conn = Connection::open(&path).unwrap();
        migrate_with(&mut conn, Some(&path), v2).unwrap();
        let (x, y): (String, i64) = conn
            .query_row("SELECT x, y FROM a", [], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap();
        assert_eq!((x.as_str(), y), ("café ☕", 7));
        let backup = Connection::open(dir.path().join("piw.sqlite3.v1.bak")).unwrap();
        assert_eq!(current_version(&backup).unwrap(), 1);
        let kept: String = backup
            .query_row("SELECT x FROM a", [], |r| r.get(0))
            .unwrap();
        assert_eq!(kept, "café ☕");
    }
}
