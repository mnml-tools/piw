//! The vault index: a SQLite cache of every note's stat, hash, tasks, links, tags and text
//! (docs/vault-format.md §5). It is rebuilt from the files whenever it is missing, unreadable or
//! from another version, so it has no migrations.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

use chrono::NaiveDate;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use unicode_normalization::UnicodeNormalization;

use super::files::FileStat;
use super::parse::{ParsedNote, Task};
use super::paths::RelPath;
use crate::domain::time::format_date;
use crate::error::{AppError, AppResult};

/// Markers wrapped around matches in snippets; the UI turns them into `<mark>` safely.
pub const MARK_START: char = '\u{2}';
pub const MARK_END: char = '\u{3}';

/// Turns user input into a safe FTS5 query: every token is quoted (no operators can be
/// injected) and prefix-matched, and all tokens must match.
pub fn to_fts_query(input: &str) -> Option<String> {
    let tokens: Vec<String> = input
        .split(|c: char| c.is_whitespace() || (c.is_ascii_punctuation() && c != '_' && c != '#'))
        .map(|t| t.trim_start_matches('#'))
        .filter(|t| !t.is_empty())
        .take(12)
        .map(|t| format!("\"{}\"*", t.replace('"', "\"\"")))
        .collect();
    (!tokens.is_empty()).then(|| tokens.join(" "))
}

/// Bump to rebuild every index on the next start.
pub const INDEX_VERSION: u32 = 2;

const SEARCH_LIMIT: i64 = 100;

const SCHEMA: &str = "
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS links;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS search;
CREATE TABLE notes (
    path TEXT PRIMARY KEY,
    space TEXT,
    title TEXT NOT NULL,
    title_key TEXT NOT NULL,
    link_key TEXT NOT NULL,
    size INTEGER NOT NULL,
    mtime_ns INTEGER NOT NULL,
    hash TEXT NOT NULL,
    tasks_open INTEGER NOT NULL,
    tasks_done INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX notes_title_key ON notes (title_key);
CREATE INDEX notes_link_key ON notes (link_key);
CREATE TABLE tasks (
    path TEXT NOT NULL,
    line INTEGER NOT NULL,
    checked INTEGER NOT NULL,
    text TEXT NOT NULL,
    due TEXT,
    done TEXT,
    heading TEXT,
    parent_line INTEGER,
    line_text TEXT NOT NULL,
    box_at INTEGER NOT NULL,
    PRIMARY KEY (path, line)
) WITHOUT ROWID;
CREATE INDEX tasks_open_due ON tasks (due) WHERE checked = 0;
CREATE TABLE links (
    path TEXT NOT NULL,
    ord INTEGER NOT NULL,
    target TEXT NOT NULL,
    target_key TEXT NOT NULL,
    heading TEXT,
    PRIMARY KEY (path, ord)
) WITHOUT ROWID;
CREATE INDEX links_target_key ON links (target_key);
CREATE TABLE tags (
    path TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (path, tag)
) WITHOUT ROWID;
CREATE INDEX tags_tag ON tags (tag);
CREATE VIRTUAL TABLE search USING fts5 (
    path UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2'
);
";

/// What the index last saw of a file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Known {
    pub stat: FileStat,
    pub hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexedNote {
    pub path: RelPath,
    pub space: Option<String>,
    pub title: String,
    pub hash: String,
    pub tasks_open: i64,
    pub tasks_done: i64,
}

#[cfg_attr(not(test), allow(dead_code))] // Read by the task panel and views (phase 3).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedLink {
    pub target: String,
    pub heading: Option<String>,
    /// The note the link points to, or `None` when it matches no note.
    pub path: Option<RelPath>,
}

pub struct Index {
    conn: Mutex<Connection>,
}

impl Index {
    /// Opens the index at `path`, rebuilding the file if it cannot be read.
    pub fn open(path: &Path) -> AppResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        Self::try_open(path).or_else(|error| {
            log::warn!("vault index unreadable ({:?}), rebuilding it", error.code());
            for suffix in ["", "-wal", "-shm"] {
                let mut file = path.as_os_str().to_owned();
                file.push(suffix);
                let _ = std::fs::remove_file(file);
            }
            Self::try_open(path)
        })
    }

    fn try_open(path: &Path) -> AppResult<Self> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Self::prepare(conn)
    }

    fn prepare(mut conn: Connection) -> AppResult<Self> {
        conn.pragma_update(None, "busy_timeout", 5000)?;
        conn.pragma_update(None, "trusted_schema", "OFF")?;
        let version: u32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version != INDEX_VERSION {
            let tx = conn.transaction()?;
            tx.execute_batch(SCHEMA)?;
            tx.pragma_update(None, "user_version", INDEX_VERSION)?;
            tx.commit()?;
        }
        conn.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    fn lock(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.conn
            .lock()
            .map_err(|_| AppError::Internal("vault index lock poisoned".into()))
    }

    fn write<T>(&self, f: impl FnOnce(&Transaction<'_>) -> AppResult<T>) -> AppResult<T> {
        let mut conn = self.lock()?;
        let tx = conn.transaction()?;
        let value = f(&tx)?;
        tx.commit()?;
        Ok(value)
    }

    /// Stat and hash of every indexed note.
    pub fn known(&self) -> AppResult<HashMap<RelPath, Known>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT path, size, mtime_ns, hash FROM notes")?;
        let rows = stmt.query_map([], |r| {
            Ok((
                RelPath::trusted(r.get(0)?),
                Known {
                    stat: FileStat {
                        size: r.get(1)?,
                        mtime_ns: r.get(2)?,
                    },
                    hash: r.get(3)?,
                },
            ))
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    pub fn hash_of(&self, path: &RelPath) -> AppResult<Option<String>> {
        let conn = self.lock()?;
        Ok(conn
            .query_row(
                "SELECT hash FROM notes WHERE path = ?1",
                [path.as_str()],
                |r| r.get(0),
            )
            .optional()?)
    }

    /// Replaces everything the index holds for `path`.
    pub fn put(
        &self,
        path: &RelPath,
        stat: FileStat,
        hash: &str,
        text: &str,
        note: &ParsedNote,
    ) -> AppResult<()> {
        self.write(|tx| {
            delete_rows(tx, path)?;
            let done = note.tasks.iter().filter(|t| t.checked).count();
            let open = note.tasks.len() - done;
            tx.execute(
                "INSERT INTO notes (path, space, title, title_key, link_key, size, mtime_ns, hash,
                    tasks_open, tasks_done)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    path.as_str(),
                    path.space(),
                    path.title(),
                    path.title().to_lowercase(),
                    path.link_key(),
                    stat.size,
                    stat.mtime_ns,
                    hash,
                    i64::try_from(open).unwrap_or(i64::MAX),
                    i64::try_from(done).unwrap_or(i64::MAX),
                ],
            )?;
            let mut insert = tx.prepare_cached(
                "INSERT INTO tasks (path, line, checked, text, due, done, heading, parent_line,
                    line_text, box_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            )?;
            for task in &note.tasks {
                insert.execute(params![
                    path.as_str(),
                    task.line,
                    task.checked,
                    task.text,
                    task.due.map(format_date),
                    task.done.map(format_date),
                    task.heading,
                    task.parent_line,
                    task.line_text,
                    i64::try_from(task.box_at).unwrap_or(i64::MAX),
                ])?;
            }
            let mut insert = tx.prepare_cached(
                "INSERT INTO links (path, ord, target, target_key, heading)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (ord, link) in note.links.iter().enumerate() {
                insert.execute(params![
                    path.as_str(),
                    i64::try_from(ord).unwrap_or(i64::MAX),
                    link.target,
                    link_target_key(&link.target),
                    link.heading,
                ])?;
            }
            let mut insert = tx.prepare_cached("INSERT INTO tags (path, tag) VALUES (?1, ?2)")?;
            for tag in &note.tags {
                insert.execute(params![path.as_str(), tag])?;
            }
            tx.execute(
                "INSERT INTO search (path, title, body) VALUES (?1, ?2, ?3)",
                params![path.as_str(), path.title(), text],
            )?;
            Ok(())
        })
    }

    /// Records a new stat for a file whose content did not change.
    pub fn touch(&self, path: &RelPath, stat: FileStat) -> AppResult<()> {
        self.write(|tx| {
            tx.execute(
                "UPDATE notes SET size = ?2, mtime_ns = ?3 WHERE path = ?1",
                params![path.as_str(), stat.size, stat.mtime_ns],
            )?;
            Ok(())
        })
    }

    pub fn remove(&self, path: &RelPath) -> AppResult<()> {
        self.write(|tx| delete_rows(tx, path))
    }

    #[cfg_attr(not(test), allow(dead_code))] // Read by the task panel and views (phase 3).
    pub fn note(&self, path: &RelPath) -> AppResult<Option<IndexedNote>> {
        let conn = self.lock()?;
        Ok(conn
            .query_row(
                "SELECT path, space, title, hash, tasks_open, tasks_done FROM notes
                 WHERE path = ?1",
                [path.as_str()],
                indexed_note,
            )
            .optional()?)
    }

    /// Every note, by path.
    pub fn notes(&self) -> AppResult<Vec<IndexedNote>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT path, space, title, hash, tasks_open, tasks_done FROM notes ORDER BY path",
        )?;
        let rows = stmt.query_map([], indexed_note)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// A note's tasks, in line order. The note panel parses the live text instead (it follows
    /// typing); this is what the tests read.
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn tasks_of(&self, path: &RelPath) -> AppResult<Vec<Task>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT line, checked, text, due, done, heading, parent_line, line_text, box_at
             FROM tasks WHERE path = ?1 ORDER BY line",
        )?;
        let rows = stmt.query_map([path.as_str()], stored_task)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// The tasks a task view lists (docs/redesign.md, "Task view"), with the note they live in
    /// and that note's hash. Each view keeps the tasks ticked today, so ticking one does not
    /// make it vanish. `space` keeps one top-level folder.
    pub fn tasks(
        &self,
        view: TaskView,
        today: NaiveDate,
        space: Option<&str>,
    ) -> AppResult<Vec<ViewTask>> {
        let filter = match view {
            TaskView::Today => "t.due IS NOT NULL AND t.due <= ?1",
            TaskView::Upcoming => "t.due > ?1",
            TaskView::All => "1",
        };
        let order = match view {
            TaskView::All => "t.path, t.line",
            _ => "t.due, t.path, t.line",
        };
        let sql = format!(
            "SELECT t.line, t.checked, t.text, t.due, t.done, t.heading, t.parent_line,
                    t.line_text, t.box_at, t.path, n.hash
             FROM tasks t JOIN notes n ON n.path = t.path
             WHERE ({filter}) AND (t.checked = 0 OR t.done = ?1)
               AND (?2 IS NULL OR n.space = ?2)
             ORDER BY {order}"
        );
        let conn = self.lock()?;
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![format_date(today), space], |r| {
            Ok(ViewTask {
                task: stored_task(r)?,
                path: RelPath::trusted(r.get(9)?),
                file_hash: r.get(10)?,
            })
        })?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    #[cfg_attr(not(test), allow(dead_code))] // Read by the task panel and views (phase 3).
    pub fn tags_of(&self, path: &RelPath) -> AppResult<Vec<String>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT tag FROM tags WHERE path = ?1 ORDER BY tag")?;
        let rows = stmt.query_map([path.as_str()], |r| r.get(0))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    #[cfg_attr(not(test), allow(dead_code))] // Read by the task panel and views (phase 3).
    /// A note's links in reading order, each resolved against the current notes
    /// (docs/vault-format.md §4).
    pub fn links_of(&self, path: &RelPath) -> AppResult<Vec<ResolvedLink>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT target, target_key, heading FROM links WHERE path = ?1 ORDER BY ord",
        )?;
        let links: Vec<(String, String, Option<String>)> = stmt
            .query_map([path.as_str()], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<Result<_, _>>()?;
        links
            .into_iter()
            .map(|(target, key, heading)| {
                Ok(ResolvedLink {
                    path: resolve(&conn, &key)?,
                    target,
                    heading,
                })
            })
            .collect()
    }

    /// Notes matching `input`, best first, each with a snippet of its text whose matches sit
    /// between [`MARK_START`] and [`MARK_END`]. Every token is quoted, so FTS operators in the
    /// input are plain words.
    pub fn search(&self, input: &str) -> AppResult<Vec<SearchHit>> {
        let Some(query) = to_fts_query(input) else {
            return Ok(Vec::new());
        };
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT path, snippet(search, 2, ?3, ?4, '…', 12) FROM search WHERE search MATCH ?1
             ORDER BY bm25(search, 0.0, 10.0, 1.0) LIMIT ?2",
        )?;
        let rows = stmt.query_map(
            params![
                query,
                SEARCH_LIMIT,
                MARK_START.to_string(),
                MARK_END.to_string()
            ],
            |r| {
                Ok(SearchHit {
                    path: RelPath::trusted(r.get(0)?),
                    snippet: r.get(1)?,
                })
            },
        )?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Every note with a link that resolves to `path`, with the link's target as written.
    pub fn backlinks(&self, path: &RelPath) -> AppResult<Vec<(RelPath, String)>> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT DISTINCT path, target, target_key FROM links
             WHERE target_key = ?1 OR target_key = ?2 ORDER BY path",
        )?;
        let candidates: Vec<(String, String, String)> = stmt
            .query_map(params![path.title().to_lowercase(), path.link_key()], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })?
            .collect::<Result<_, _>>()?;
        let mut found = Vec::new();
        for (source, target, key) in candidates {
            if resolve(&conn, &key)?.as_ref() == Some(path) {
                found.push((RelPath::trusted(source), target));
            }
        }
        Ok(found)
    }

    /// The note a link target names now (docs/vault-format.md §4).
    pub fn resolve(&self, target: &str) -> AppResult<Option<RelPath>> {
        let conn = self.lock()?;
        resolve(&conn, &link_target_key(target))
    }
}

/// The task views (docs/redesign.md, "Task view").
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskView {
    /// Due today or earlier.
    Today,
    /// Due after today.
    Upcoming,
    /// Every open task.
    All,
}

/// A task as a view lists it: where it lives and the hash its line edit must name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ViewTask {
    pub path: RelPath,
    pub file_hash: String,
    pub task: Task,
}

fn stored_task(r: &rusqlite::Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        line: r.get(0)?,
        checked: r.get(1)?,
        text: r.get(2)?,
        due: stored_date(r.get(3)?),
        done: stored_date(r.get(4)?),
        heading: r.get(5)?,
        parent_line: r.get(6)?,
        line_text: r.get(7)?,
        box_at: usize::try_from(r.get::<_, i64>(8)?).unwrap_or(0),
    })
}

#[cfg(test)]
mod query_tests {
    use super::to_fts_query;

    #[test]
    fn quotes_tokens_so_operators_cannot_be_injected() {
        assert_eq!(to_fts_query("2FA").as_deref(), Some("\"2FA\"*"));
        assert_eq!(
            to_fts_query("refactor NOT \"x\" OR y*").as_deref(),
            Some("\"refactor\"* \"NOT\"* \"x\"* \"OR\"* \"y\"*")
        );
        assert_eq!(to_fts_query("#urgent").as_deref(), Some("\"urgent\"*"));
        assert_eq!(to_fts_query("   ---  "), None);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchHit {
    pub path: RelPath,
    pub snippet: String,
}

fn delete_rows(tx: &Transaction<'_>, path: &RelPath) -> AppResult<()> {
    for table in ["notes", "tasks", "links", "tags", "search"] {
        tx.execute(
            &format!("DELETE FROM {table} WHERE path = ?1"),
            [path.as_str()],
        )?;
    }
    Ok(())
}

fn indexed_note(r: &rusqlite::Row<'_>) -> rusqlite::Result<IndexedNote> {
    Ok(IndexedNote {
        path: RelPath::trusted(r.get(0)?),
        space: r.get(1)?,
        title: r.get(2)?,
        hash: r.get(3)?,
        tasks_open: r.get(4)?,
        tasks_done: r.get(5)?,
    })
}

fn stored_date(value: Option<String>) -> Option<NaiveDate> {
    value.and_then(|v| NaiveDate::parse_from_str(&v, "%Y-%m-%d").ok())
}

fn link_target_key(target: &str) -> String {
    target.nfc().collect::<String>().to_lowercase()
}

/// A link written with a path names that note; a bare title names the note with that title
/// and the shortest path.
fn resolve(conn: &Connection, key: &str) -> AppResult<Option<RelPath>> {
    let sql = if key.contains('/') {
        "SELECT path FROM notes WHERE link_key = ?1 LIMIT 1"
    } else {
        "SELECT path FROM notes WHERE title_key = ?1 ORDER BY length(path), path LIMIT 1"
    };
    Ok(conn
        .query_row(sql, [key], |r| Ok(RelPath::trusted(r.get(0)?)))
        .optional()?)
}
