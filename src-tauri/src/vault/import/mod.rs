//! The import of Piw 0.1 into the vault (docs/redesign.md, phase 5). It reads the old tables
//! with plain SQL, so the services of 0.1 can go, and writes ordinary notes:
//!
//! - each space becomes a top-level folder; archived items go to its `Archive/` folder;
//! - a quick note keeps its text; its tags go to front matter;
//! - a document becomes one note: its tabs in order (a `## Tab` heading each when it has more
//!   than one), each task reference alone on its line as that task's line, its remaining tasks
//!   where its first Tasks tab was (else under `## Tasks` at the end);
//! - a section becomes a note with its tasks (and a link to its document);
//! - every other task goes to its space's `Inbox.md`;
//! - a task line keeps its state, due date, completion date, tags, description (indented) and
//!   subtasks (nested). Trashed items are skipped.
//!
//! The old tables are left as they were: the database keeps them (and its pre-upgrade backup)
//! until a later release drops them. Stickies of 0.1 move to the notes that now hold their item.

pub mod markdown;
#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::{Connection, Transaction, params};
use serde_json::Value;

use super::paths::{RelPath, validate_name};
use super::{INBOX_TITLE, NoteFile, Vault};
use crate::domain::change::ChangeSet;
use crate::domain::text::display_title;
use crate::domain::time::now;
use crate::error::AppResult;
use crate::services::vault_stickies::{self, VaultStickyItem};
use markdown::TaskRefs;

const ARCHIVE_FOLDER: &str = "Archive";
const UNTITLED: &str = "Untitled";

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportReport {
    pub notes: usize,
    pub documents: usize,
    pub sections: usize,
    pub tasks: usize,
    pub files: Vec<RelPath>,
}

/// What the import wrote, and where each 0.1 sticky's item went (for [`move_stickies`]).
#[derive(Debug, Default)]
pub struct Imported {
    pub report: ImportReport,
    /// `(target_kind, target_id)` of a 0.1 sticky → the note that holds its item now.
    pub stickies: Vec<(String, String, RelPath)>,
}

/// True when the database holds notes or tasks of Piw 0.1 that were never imported.
pub fn pending(conn: &Connection) -> AppResult<bool> {
    if crate::services::settings::get(conn)?
        .vault_imported_at
        .is_some()
    {
        return Ok(false);
    }
    let live: i64 = conn.query_row(
        "SELECT (SELECT count(*) FROM notes WHERE deleted_at IS NULL)
              + (SELECT count(*) FROM tasks WHERE deleted_at IS NULL)",
        [],
        |r| r.get(0),
    )?;
    Ok(live > 0)
}

struct OldTask {
    id: String,
    space: String,
    document: Option<String>,
    parent: Option<String>,
    section: Option<String>,
    title: String,
    description: String,
    done: Option<String>,
    due: Option<String>,
}

/// The import's working state: the old rows, and which tasks were written where.
struct State<'a> {
    vault: &'a Vault,
    folders: HashMap<String, RelPath>,
    tasks: Vec<OldTask>,
    index: HashMap<String, usize>,
    children: HashMap<String, Vec<usize>>,
    task_tags: HashMap<String, Vec<String>>,
    /// Tasks written in the note being built (moved to `task_file` once it is written).
    placed: HashSet<String>,
    pending: Vec<String>,
    task_file: HashMap<String, RelPath>,
    report: ImportReport,
}

/// A file or folder name made from an old title: forbidden characters become `-`.
fn clean_name(title: &str, fallback: &str) -> String {
    let mut name: String = title
        .chars()
        .map(|c| {
            if c.is_control() || "/\\:*?\"<>|".contains(c) {
                '-'
            } else {
                c
            }
        })
        .collect::<String>()
        .trim_matches(['.', ' '])
        .to_owned();
    name = name
        .chars()
        .take(super::paths::MAX_NAME_CHARS)
        .collect::<String>()
        .trim_end_matches(['.', ' '])
        .to_owned();
    if validate_name(&name).is_ok() {
        name
    } else {
        fallback.to_owned()
    }
}

fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn front_matter(tags: &[String]) -> String {
    if tags.is_empty() {
        return String::new();
    }
    let list: Vec<String> = tags.iter().map(|t| tag_slug(t)).collect();
    format!("---\ntags: [{}]\n---\n\n", list.join(", "))
}

fn tag_slug(tag: &str) -> String {
    tag.trim()
        .trim_start_matches('#')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
}

impl State<'_> {
    fn live(&self, id: &str) -> Option<&OldTask> {
        self.index.get(id).map(|&i| &self.tasks[i])
    }

    /// A task is top-level when it has no parent, or its parent is gone (trashed).
    fn top_level(&self, task: &OldTask) -> bool {
        task.parent
            .as_deref()
            .is_none_or(|p| self.live(p).is_none())
    }

    /// The task's line, its description and its subtasks, at `indent`; marks them placed.
    fn task_lines(&mut self, id: &str, indent: usize) -> Option<String> {
        let i = *self.index.get(id)?;
        if self.placed.contains(id) || self.task_file.contains_key(id) {
            return None;
        }
        self.placed.insert(id.to_owned());
        self.pending.push(id.to_owned());
        let pad = " ".repeat(indent);
        let task = &self.tasks[i];
        let title = one_line(&task.title);
        let mut line = format!(
            "{pad}- [{}] {}",
            if task.done.is_some() { 'x' } else { ' ' },
            if title.is_empty() {
                "Untitled task"
            } else {
                &title
            }
        );
        for tag in self.task_tags.get(id).into_iter().flatten() {
            line.push_str(&format!(" #{}", tag_slug(tag)));
        }
        if let Some(due) = &task.due {
            line.push_str(&format!(" 📅 {due}"));
        }
        if let Some(done) = &task.done {
            line.push_str(&format!(" ✅ {}", done.get(..10).unwrap_or(done)));
        }
        let mut out = vec![line];
        for extra in task
            .description
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
        {
            out.push(format!("{pad}  {extra}"));
        }
        let kids = self.children.get(id).cloned().unwrap_or_default();
        for child in kids {
            let child_id = self.tasks[child].id.clone();
            if let Some(lines) = self.task_lines(&child_id, indent + 2) {
                out.push(lines);
            }
        }
        Some(out.join("\n"))
    }

    /// The top-level tasks matching `keep` that are not written yet, as one list.
    fn remaining(&mut self, keep: impl Fn(&OldTask) -> bool) -> Option<String> {
        let ids: Vec<String> = self
            .tasks
            .iter()
            .filter(|t| self.top_level(t) && keep(t))
            .map(|t| t.id.clone())
            .collect();
        let lines: Vec<String> = ids.iter().filter_map(|id| self.task_lines(id, 0)).collect();
        (!lines.is_empty()).then(|| lines.join("\n"))
    }

    fn folder(&mut self, space: &str, archived: bool) -> AppResult<Option<RelPath>> {
        let Some(folder) = self.folders.get(space).cloned() else {
            return Ok(None);
        };
        if !archived {
            return Ok(Some(folder));
        }
        let archive = folder.join(ARCHIVE_FOLDER)?;
        std::fs::create_dir_all(archive.to_fs(self.vault.root()))?;
        Ok(Some(archive))
    }

    /// Writes a note and records the tasks placed in it.
    fn write(&mut self, folder: Option<&RelPath>, title: &str, text: &str) -> AppResult<NoteFile> {
        let note = self
            .vault
            .create_note(folder, &clean_name(title, UNTITLED), text)?;
        for id in self.pending.drain(..) {
            self.task_file.insert(id, note.path.clone());
        }
        self.placed.clear();
        self.report.files.push(note.path.clone());
        Ok(note)
    }
}

struct Refs<'s, 'a> {
    state: &'s mut State<'a>,
}

impl TaskRefs for Refs<'_, '_> {
    fn block(&mut self, task_id: &str) -> Option<String> {
        let id = task_id.to_ascii_lowercase();
        let task = self.state.live(&id)?;
        if !self.state.top_level(task) {
            return None;
        }
        self.state.task_lines(&id, 0)
    }

    fn inline(&mut self, task_id: &str) -> String {
        self.state
            .live(&task_id.to_ascii_lowercase())
            .map(|t| markdown_text(&one_line(&t.title)))
            .unwrap_or_default()
    }
}

fn markdown_text(text: &str) -> String {
    let doc = serde_json::json!({ "type": "doc", "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": text }] }
    ] });
    markdown::to_markdown(&doc, &mut NoRefs)
        .trim_end()
        .to_owned()
}

struct NoRefs;

impl TaskRefs for NoRefs {
    fn block(&mut self, _: &str) -> Option<String> {
        None
    }
    fn inline(&mut self, _: &str) -> String {
        String::new()
    }
}

fn tags_by(conn: &Connection, sql: &str) -> AppResult<HashMap<String, Vec<String>>> {
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (id, tag) = row?;
        map.entry(id).or_default().push(tag);
    }
    for tags in map.values_mut() {
        tags.sort_by_key(|t| t.to_lowercase());
    }
    Ok(map)
}

/// Writes the notes and tasks of Piw 0.1 into `vault`. Files get free names, so nothing in the
/// vault is ever overwritten.
pub fn import(conn: &Connection, vault: &Vault) -> AppResult<Imported> {
    let mut folders = HashMap::new();
    {
        let mut stmt =
            conn.prepare("SELECT id, name FROM spaces ORDER BY sort_order, created_at")?;
        let spaces: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<_, _>>()?;
        for (id, name) in spaces {
            let name = clean_name(&name, "Space");
            let folder = RelPath::parse(&name)?;
            if !folder.to_fs(vault.root()).is_dir() {
                vault.create_folder(None, &name)?;
            }
            folders.insert(id, folder);
        }
    }
    let tasks: Vec<OldTask> = {
        let mut stmt = conn.prepare(
            "SELECT id, space_id, document_id, parent_task_id, section_id, title, description,
                    completed_at, due_date
             FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order, created_at, id",
        )?;
        stmt.query_map([], |r| {
            Ok(OldTask {
                id: r.get(0)?,
                space: r.get(1)?,
                document: r.get(2)?,
                parent: r.get(3)?,
                section: r.get(4)?,
                title: r.get(5)?,
                description: r.get(6)?,
                done: r.get(7)?,
                due: r.get(8)?,
            })
        })?
        .collect::<Result<_, _>>()?
    };
    let index: HashMap<String, usize> = tasks
        .iter()
        .enumerate()
        .map(|(i, t)| (t.id.clone(), i))
        .collect();
    let mut children: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, task) in tasks.iter().enumerate() {
        if let Some(parent) = &task.parent
            && index.contains_key(parent)
        {
            children.entry(parent.clone()).or_default().push(i);
        }
    }
    let mut state = State {
        vault,
        folders,
        tasks,
        index,
        children,
        task_tags: tags_by(
            conn,
            "SELECT tt.task_id, t.name FROM task_tags tt JOIN tags t ON t.id = tt.tag_id",
        )?,
        placed: HashSet::new(),
        pending: Vec::new(),
        task_file: HashMap::new(),
        report: ImportReport::default(),
    };
    let note_tags = tags_by(
        conn,
        "SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id",
    )?;
    let mut note_file: HashMap<String, RelPath> = HashMap::new();
    let mut tab_document: HashMap<String, String> = HashMap::new();

    // Documents, with their tasks.
    let documents: Vec<(String, String, String, bool)> = conn
        .prepare(
            "SELECT id, space_id, title, archived_at IS NOT NULL FROM notes
             WHERE kind = 'document' AND deleted_at IS NULL ORDER BY created_at, id",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<Result<_, _>>()?;
    for (id, space, title, archived) in documents {
        let tabs: Vec<(String, String, String, Option<String>, String)> = conn
            .prepare(
                "SELECT id, kind, title, content_json, plain_text FROM document_tabs
                 WHERE document_id = ?1 AND deleted_at IS NULL ORDER BY sort_order",
            )?
            .query_map([&id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })?
            .collect::<Result<_, _>>()?;
        let headed = tabs.len() > 1;
        let mut parts: Vec<String> = Vec::new();
        for (tab_id, kind, tab_title, json, plain) in &tabs {
            tab_document.insert(tab_id.clone(), id.clone());
            let body = if kind == "tasks" {
                let doc = id.clone();
                state.remaining(|t| t.document.as_deref() == Some(doc.as_str()))
            } else {
                let parsed = json
                    .as_deref()
                    .and_then(|j| serde_json::from_str::<Value>(j).ok());
                match parsed {
                    Some(doc) => Some(markdown::to_markdown(&doc, &mut Refs { state: &mut state })),
                    None => (!plain.trim().is_empty()).then(|| plain.clone()),
                }
            };
            let body = body
                .map(|b| b.trim_end().to_owned())
                .filter(|b| !b.is_empty());
            match (headed, body) {
                (true, body) => parts.push(match body {
                    Some(body) => format!("## {}\n\n{body}", one_line(tab_title)),
                    None => format!("## {}", one_line(tab_title)),
                }),
                (false, Some(body)) => parts.push(body),
                (false, None) => {}
            }
        }
        let doc = id.clone();
        if let Some(rest) = state.remaining(|t| t.document.as_deref() == Some(doc.as_str())) {
            parts.push(if parts.is_empty() {
                rest
            } else {
                format!("## Tasks\n\n{rest}")
            });
        }
        let text = format!(
            "{}{}",
            front_matter(note_tags.get(&id).map_or(&[][..], Vec::as_slice)),
            parts.join("\n\n")
        );
        let folder = state.folder(&space, archived)?;
        let note = state.write(folder.as_ref(), &title, &text)?;
        note_file.insert(id, note.path);
        state.report.documents += 1;
    }

    // Sections, with their tasks outside documents.
    let sections: Vec<(String, String, String, Option<String>)> = conn
        .prepare(
            "SELECT id, space_id, title, document_id FROM task_sections
             WHERE deleted_at IS NULL ORDER BY space_id, sort_order",
        )?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
        .collect::<Result<_, _>>()?;
    let mut section_file: HashMap<String, RelPath> = HashMap::new();
    for (id, space, title, document) in sections {
        let mut parts = Vec::new();
        if let Some(path) = document.as_ref().and_then(|d| note_file.get(d)) {
            parts.push(format!("See [[{}]].", path.title()));
        }
        let section = id.clone();
        if let Some(tasks) = state.remaining(|t| t.section.as_deref() == Some(section.as_str())) {
            parts.push(tasks);
        }
        let folder = state.folder(&space, false)?;
        let note = state.write(folder.as_ref(), &title, &parts.join("\n\n"))?;
        section_file.insert(id, note.path);
        state.report.sections += 1;
    }

    // Quick notes.
    let notes: Vec<(String, String, String, Option<String>, bool)> = conn
        .prepare(
            "SELECT id, space_id, title, body, archived_at IS NOT NULL FROM notes
             WHERE kind = 'quick_note' AND deleted_at IS NULL ORDER BY created_at, id",
        )?
        .query_map([], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })?
        .collect::<Result<_, _>>()?;
    for (id, space, title, body, archived) in notes {
        let title = display_title(&title, body.as_deref());
        let text = format!(
            "{}{}",
            front_matter(note_tags.get(&id).map_or(&[][..], Vec::as_slice)),
            body.unwrap_or_default().trim_end()
        );
        let folder = state.folder(&space, archived)?;
        let note = state.write(folder.as_ref(), &title, &text)?;
        note_file.insert(id, note.path);
        state.report.notes += 1;
    }

    // Every other task, in its space's Inbox.
    let spaces: Vec<String> = state
        .folders
        .keys()
        .cloned()
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    for space in spaces {
        let here = space.clone();
        let Some(lines) = state.remaining(|t| t.space == here) else {
            continue;
        };
        let folder = state.folder(&space, false)?;
        let inbox = super::child(folder.as_ref(), &super::paths::note_file_name(INBOX_TITLE))?;
        if inbox.to_fs(vault.root()).is_file() {
            let current = vault.read(&inbox)?;
            let base = current.text.trim_end_matches('\n');
            let text = if base.trim().is_empty() {
                format!("{lines}\n")
            } else {
                format!("{base}\n\n{lines}\n")
            };
            vault.write(&inbox, &text, &current.hash)?;
            for id in state.pending.drain(..) {
                state.task_file.insert(id, inbox.clone());
            }
            state.placed.clear();
            state.report.files.push(inbox);
        } else {
            state.write(folder.as_ref(), INBOX_TITLE, &lines)?;
        }
    }
    state.report.tasks = state.task_file.len();

    // Where each 0.1 sticky's item is now.
    let mut stickies = Vec::new();
    {
        let mut stmt = conn.prepare(
            "SELECT target_kind, target_id FROM sticky_windows
             WHERE target_kind IN ('note', 'task', 'tasks_tab', 'section')",
        )?;
        let rows: Vec<(String, String)> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<_, _>>()?;
        for (kind, id) in rows {
            let path = match kind.as_str() {
                "note" => note_file.get(&id),
                "task" => state.task_file.get(&id),
                "tasks_tab" => tab_document.get(&id).and_then(|d| note_file.get(d)),
                _ => section_file.get(&id),
            };
            if let Some(path) = path {
                stickies.push((kind, id, path.clone()));
            }
        }
    }
    let mut report = state.report;
    report.files.sort();
    report.files.dedup();
    Ok(Imported { report, stickies })
}

/// Moves the 0.1 stickies to vault stickies of the notes that hold their items (keeping their
/// place, size, colour and on-top), forgets the rest, and marks the import as done.
pub fn finish(
    tx: &Transaction<'_>,
    root: &str,
    moved: &[(String, String, RelPath)],
) -> AppResult<ChangeSet> {
    let mut seen = BTreeMap::new();
    for (kind, id, path) in moved {
        let target = vault_stickies::target_for(
            tx,
            root,
            &VaultStickyItem::Note {
                path: path.to_string(),
            },
        )?;
        if seen.insert(target.id.clone(), ()).is_some() {
            continue;
        }
        tx.execute(
            "INSERT OR IGNORE INTO sticky_windows
                 (target_kind, target_id, x, y, width, height, always_on_top, color, is_open,
                  created_at, updated_at)
             SELECT 'vault_note', ?3, x, y, width, height, always_on_top, color, is_open,
                    created_at, ?4
             FROM sticky_windows WHERE target_kind = ?1 AND target_id = ?2",
            params![kind, id, target.id, now()],
        )?;
    }
    // Stickies that did not move would reopen as windows nothing can show any more.
    tx.execute(
        "DELETE FROM sticky_windows WHERE target_kind IN ('note', 'task', 'tasks_tab', 'section')",
        [],
    )?;
    tx.execute(
        "DELETE FROM vault_stickies WHERE NOT EXISTS (SELECT 1 FROM sticky_windows s
            WHERE s.target_kind = vault_stickies.target_kind AND s.target_id = vault_stickies.target_id)",
        [],
    )?;
    let mut patch = serde_json::Map::new();
    patch.insert("vaultImportedAt".into(), Value::String(now()));
    let (_, changes) = crate::services::settings::update(tx, patch)?;
    Ok(changes)
}
