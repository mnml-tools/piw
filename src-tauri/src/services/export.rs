//! Open export and consistent backups (plan §4.5).
//!
//! * Export: Rust gathers everything (outside Trash) as versioned JSON; the UI turns document
//!   tabs into Markdown with the same serializer the editor uses (docs/architecture.md#documents-and-the-editor) and asks Rust to
//!   write the files inside a folder the user picked. Paths are validated here.
//! * Backup: `VACUUM INTO` writes a consistent copy of the live database (safe while Piw runs).

use std::path::{Component, Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::{documents, notes, spaces, tags, tasks};
use crate::domain::model::{Document, Note, Space, Tag, Task};
use crate::error::{AppError, AppResult};

/// Bump when the export layout changes; documented in docs/architecture.md#data-export-and-backup.
pub const EXPORT_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct ExportData {
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub spaces: Vec<Space>,
    /// Quick notes (including archived), with their full text.
    pub notes: Vec<Note>,
    pub documents: Vec<Document>,
    /// Every task and subtask outside Trash.
    pub tasks: Vec<Task>,
    pub tags: Vec<Tag>,
}

pub fn gather(conn: &Connection, app_version: &str) -> AppResult<ExportData> {
    let ids = |sql: &str| -> AppResult<Vec<String>> {
        let mut stmt = conn.prepare(sql)?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    };
    let notes = ids(
        "SELECT id FROM notes WHERE kind = 'quick_note' AND deleted_at IS NULL ORDER BY created_at",
    )?
    .iter()
    .map(|id| notes::get(conn, id))
    .collect::<AppResult<Vec<_>>>()?;
    let documents = ids(
        "SELECT id FROM notes WHERE kind = 'document' AND deleted_at IS NULL ORDER BY created_at",
    )?
    .iter()
    .map(|id| documents::get(conn, id))
    .collect::<AppResult<Vec<_>>>()?;
    let tasks = ids(
        "SELECT t.id FROM tasks t LEFT JOIN tasks p ON p.id = t.parent_task_id
          WHERE t.deleted_at IS NULL AND (p.id IS NULL OR p.deleted_at IS NULL)
          ORDER BY t.parent_task_id IS NOT NULL, t.sort_order, t.created_at",
    )?
    .iter()
    .map(|id| tasks::get(conn, id))
    .collect::<AppResult<Vec<_>>>()?;
    Ok(ExportData {
        format_version: EXPORT_FORMAT_VERSION,
        app_version: app_version.to_owned(),
        exported_at: crate::domain::time::now(),
        spaces: spaces::list(conn)?,
        notes,
        documents,
        tasks,
        tags: tags::list(conn)?,
    })
}

#[derive(Debug, Clone, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct ExportFile {
    /// Relative path inside the export folder, `/`-separated (e.g. `notes/Ligar.md`).
    pub path: String,
    pub contents: String,
}

const MAX_FILES: usize = 50_000;
const MAX_TOTAL_BYTES: usize = 2 * 1024 * 1024 * 1024;

/// Windows device names (`CON`, `COM1`…`COM9`, `LPT1`…`LPT9`…), also with an extension.
fn is_reserved_windows_name(segment: &str) -> bool {
    let stem = segment
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end()
        .to_ascii_uppercase();
    matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) || ((stem.starts_with("COM") || stem.starts_with("LPT"))
        && stem.len() == 4
        && stem.as_bytes()[3].is_ascii_digit()
        && stem.as_bytes()[3] != b'0')
}

/// Validates a relative export path: no absolute paths, `..`, empty or reserved segments.
pub fn safe_relative_path(path: &str) -> AppResult<PathBuf> {
    // The path is built from titles: never echo it (errors are safe to show and log).
    let invalid = || AppError::validation("an export file name is not valid on this system");
    if path.is_empty() || path.len() > 400 || path.contains('\\') || path.contains('\0') {
        return Err(invalid());
    }
    let mut out = PathBuf::new();
    for segment in path.split('/') {
        let reserved = is_reserved_windows_name(segment);
        if segment.is_empty()
            || segment == "."
            || segment == ".."
            || segment.len() > 200
            || reserved
            || segment.ends_with(' ')
            || segment.ends_with('.')
            || segment
                .chars()
                .any(|c| matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') || c.is_control())
        {
            return Err(invalid());
        }
        out.push(segment);
    }
    if out.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(invalid());
    }
    Ok(out)
}

/// Writes `files` into a new, uniquely named folder inside `parent` and returns it.
pub fn write_export(parent: &Path, folder_name: &str, files: &[ExportFile]) -> AppResult<PathBuf> {
    if files.len() > MAX_FILES
        || files.iter().map(|f| f.contents.len()).sum::<usize>() > MAX_TOTAL_BYTES
    {
        return Err(AppError::validation("the export is too large"));
    }
    let checked: Vec<(PathBuf, &str)> = files
        .iter()
        .map(|f| Ok((safe_relative_path(&f.path)?, f.contents.as_str())))
        .collect::<AppResult<_>>()?;
    let base_name = safe_relative_path(folder_name)?;
    let mut root = parent.join(&base_name);
    for n in 2.. {
        if !root.exists() {
            break;
        }
        root = parent.join(format!("{} ({n})", base_name.display()));
    }
    std::fs::create_dir_all(&root)?;
    for (relative, contents) in checked {
        let path = root.join(relative);
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        write_new(&path, contents.as_bytes())?;
    }
    Ok(root)
}

/// Creates `path` without ever replacing an existing file: names that collide (e.g. differ
/// only in case or Unicode normalisation on case-insensitive file systems) get " (2)", " (3)"…
fn write_new(path: &Path, contents: &[u8]) -> AppResult<()> {
    use std::io::Write;
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for n in 1..1000 {
        let candidate = if n == 1 {
            path.to_path_buf()
        } else {
            path.with_file_name(format!("{stem} ({n}){extension}"))
        };
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                file.write_all(contents)?;
                return Ok(());
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(AppError::Storage(
        "too many files with the same name".into(),
    ))
}

/// Writes a consistent copy of the database to `target` (replacing it atomically).
pub fn backup(conn: &Connection, target: &Path) -> AppResult<()> {
    let file_name = target
        .file_name()
        .ok_or_else(|| AppError::validation("choose a file name for the backup"))?;
    let temp = target.with_file_name(format!(".{}.partial", file_name.to_string_lossy()));
    let _ = std::fs::remove_file(&temp);
    conn.execute("VACUUM INTO ?1", [temp.to_string_lossy().into_owned()])?;
    std::fs::rename(&temp, target)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::notes::CreateNote;
    use crate::services::tasks::CreateTask;
    use crate::services::test_support::db;

    #[test]
    fn rejects_paths_that_escape_the_export_folder() {
        assert!(safe_relative_path("notes/Ligar ao fornecedor.md").is_ok());
        for bad in [
            "../x.md",
            "/etc/passwd",
            "a/../../b",
            "a//b",
            "C:\\x",
            "con.md",
            "a/b?.md",
            "",
            "x/.",
        ] {
            assert!(safe_relative_path(bad).is_err(), "{bad} must be rejected");
        }
    }

    #[test]
    fn writes_files_into_a_new_unique_folder() {
        let dir = tempfile::tempdir().unwrap();
        let files = vec![
            ExportFile {
                path: "notes/café ☕.md".into(),
                contents: "Ação 🚀".into(),
            },
            ExportFile {
                path: "tasks.json".into(),
                contents: "[]".into(),
            },
        ];
        let first = write_export(dir.path(), "Piw export", &files).unwrap();
        let second = write_export(dir.path(), "Piw export", &files).unwrap();
        assert_ne!(first, second, "an existing export is never overwritten");
        assert_eq!(
            std::fs::read_to_string(first.join("notes/café ☕.md")).unwrap(),
            "Ação 🚀"
        );
        let escape = vec![ExportFile {
            path: "../evil".into(),
            contents: String::new(),
        }];
        assert!(write_export(dir.path(), "Piw export", &escape).is_err());
    }

    #[test]
    fn export_contains_everything_outside_trash() {
        let db = db();
        db.write(|tx| {
            crate::services::notes::create(
                tx,
                CreateNote {
                    body: "kept".into(),
                    ..Default::default()
                },
            )
        })
        .unwrap();
        let gone = db
            .write(|tx| {
                crate::services::notes::create(
                    tx,
                    CreateNote {
                        body: "gone".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .0;
        db.write(|tx| crate::services::notes::trash(tx, &gone.id))
            .unwrap();
        let parent = db
            .write(|tx| {
                crate::services::tasks::create(
                    tx,
                    CreateTask {
                        title: "p".into(),
                        ..Default::default()
                    },
                )
            })
            .unwrap()
            .0;
        db.write(|tx| {
            crate::services::tasks::create(
                tx,
                CreateTask {
                    title: "c".into(),
                    parent_task_id: Some(parent.id.clone()),
                    ..Default::default()
                },
            )
        })
        .unwrap();
        let data = db.read(|c| gather(c, "0.1.0")).unwrap();
        assert_eq!(data.format_version, EXPORT_FORMAT_VERSION);
        assert_eq!(
            data.notes
                .iter()
                .map(|n| n.body.as_deref())
                .collect::<Vec<_>>(),
            [Some("kept")]
        );
        assert_eq!(data.tasks.len(), 2);
        assert_eq!(data.spaces.len(), 2);
    }

    #[test]
    fn backup_is_a_complete_consistent_database() {
        let dir = tempfile::tempdir().unwrap();
        let db = crate::storage::Database::open(&dir.path().join("piw.sqlite3")).unwrap();
        db.write(crate::services::spaces::ensure_seeded).unwrap();
        db.write(|tx| {
            crate::services::tasks::create(
                tx,
                CreateTask {
                    title: "Comprar café".into(),
                    ..Default::default()
                },
            )
        })
        .unwrap();
        let target = dir.path().join("backup.sqlite3");
        std::fs::write(&target, "old").unwrap();
        db.read(|c| backup(c, &target)).unwrap();
        let copy = crate::storage::Database::open(&target).unwrap();
        let titles: Vec<String> = copy
            .read(|c| {
                Ok(c.prepare("SELECT title FROM tasks")?
                    .query_map([], |r| r.get(0))?
                    .collect::<Result<_, _>>()?)
            })
            .unwrap();
        assert_eq!(titles, ["Comprar café"]);
    }
}
