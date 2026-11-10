//! What the vault commands send to the UI (camelCase JSON, TypeScript in `src/lib/ipc/bindings`).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::index::{SearchHit, TaskView, ViewTask};
use super::paths::RelPath;
use super::tasks::TaskChange;
use super::{EntryKind, NoteFile, TrashEntry, TreeEntry};
use crate::domain::time::{format_date, parse_date};
use crate::error::AppResult;
use crate::platform::labels::StickyTarget;
use crate::services::vault_stickies::VaultStickyItem;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum VaultPhaseName {
    Starting,
    Ready,
    Failed,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultStatus {
    pub phase: VaultPhaseName,
    /// The vault folder on disk.
    pub root: Option<String>,
    /// Why the vault could not be opened (no note content).
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum VaultEntryKind {
    Folder,
    Note,
}

impl From<EntryKind> for VaultEntryKind {
    fn from(kind: EntryKind) -> Self {
        match kind {
            EntryKind::Folder => Self::Folder,
            EntryKind::Note => Self::Note,
        }
    }
}

/// A folder or note in the tree, in tree order.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultEntry {
    pub path: String,
    pub kind: VaultEntryKind,
    /// A note's title, or a folder's name.
    pub name: String,
}

impl From<TreeEntry> for VaultEntry {
    fn from(entry: TreeEntry) -> Self {
        Self {
            name: display_name(&entry.path, entry.kind),
            path: entry.path.to_string(),
            kind: entry.kind.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultNote {
    pub path: String,
    pub title: String,
    pub space: Option<String>,
    /// LF line endings, no byte-order mark.
    pub text: String,
    /// Send it back with the next write: the write is refused if the file changed since.
    pub hash: String,
}

impl From<NoteFile> for VaultNote {
    fn from(note: NoteFile) -> Self {
        Self {
            title: note.path.title().to_owned(),
            space: note.path.space().map(str::to_owned),
            path: note.path.to_string(),
            text: note.text,
            hash: note.hash,
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultSearchHit {
    pub path: String,
    pub title: String,
    pub space: Option<String>,
    /// Text around the matches, which sit between U+0002 and U+0003.
    pub snippet: String,
}

impl From<SearchHit> for VaultSearchHit {
    fn from(hit: SearchHit) -> Self {
        Self {
            title: hit.path.title().to_owned(),
            space: hit.path.space().map(str::to_owned),
            path: hit.path.to_string(),
            snippet: hit.snippet,
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultTrashItem {
    pub id: String,
    /// Where it was.
    pub path: String,
    pub name: String,
    pub kind: VaultEntryKind,
}

impl From<TrashEntry> for VaultTrashItem {
    fn from(entry: TrashEntry) -> Self {
        let kind = if entry.path.is_note() {
            EntryKind::Note
        } else {
            EntryKind::Folder
        };
        Self {
            name: display_name(&entry.path, kind),
            path: entry.path.to_string(),
            id: entry.id,
            kind: kind.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultRenamed {
    pub path: String,
    /// Notes whose links to the renamed note were rewritten.
    pub linked: Vec<String>,
}

fn display_name(path: &RelPath, kind: EntryKind) -> String {
    match kind {
        EntryKind::Note => path.title().to_owned(),
        EntryKind::Folder => path.name().to_owned(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum VaultTaskView {
    Today,
    Upcoming,
    All,
}

impl From<VaultTaskView> for TaskView {
    fn from(view: VaultTaskView) -> Self {
        match view {
            VaultTaskView::Today => Self::Today,
            VaultTaskView::Upcoming => Self::Upcoming,
            VaultTaskView::All => Self::All,
        }
    }
}

/// A task in a view, with what its line edit must send back.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultTask {
    pub path: String,
    pub note_title: String,
    pub space: Option<String>,
    pub line: u32,
    pub line_text: String,
    pub file_hash: String,
    pub checked: bool,
    pub text: String,
    /// `YYYY-MM-DD`.
    pub due: Option<String>,
    pub done: Option<String>,
    pub heading: Option<String>,
    pub parent_line: Option<u32>,
}

impl From<ViewTask> for VaultTask {
    fn from(item: ViewTask) -> Self {
        let task = item.task;
        Self {
            note_title: item.path.title().to_owned(),
            space: item.path.space().map(str::to_owned),
            path: item.path.to_string(),
            line: task.line,
            line_text: task.line_text,
            file_hash: item.file_hash,
            checked: task.checked,
            text: task.text,
            due: task.due.map(format_date),
            done: task.done.map(format_date),
            heading: task.heading,
            parent_line: task.parent_line,
        }
    }
}

/// What a task edit does (docs/vault-format.md §3, "What Piw writes").
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum VaultTaskChange {
    /// `today` is the caller's local date, written as the completion date.
    Check {
        checked: bool,
        today: String,
    },
    Due {
        due: Option<String>,
    },
    Text {
        text: String,
    },
}

impl VaultTaskChange {
    pub fn parse(self) -> AppResult<TaskChange> {
        Ok(match self {
            Self::Check { checked, today } => TaskChange::Check {
                checked,
                today: parse_date(&today)?,
            },
            Self::Due { due } => TaskChange::Due(due.as_deref().map(parse_date).transpose()?),
            Self::Text { text } => TaskChange::Text(text),
        })
    }
}

impl VaultTaskView {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Today => "today",
            Self::Upcoming => "upcoming",
            Self::All => "all",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "today" => Some(Self::Today),
            "upcoming" => Some(Self::Upcoming),
            "all" => Some(Self::All),
            _ => None,
        }
    }
}

/// What a vault sticky shows.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum VaultStickyView {
    Note {
        path: String,
        title: String,
    },
    Tasks {
        view: VaultTaskView,
        space: Option<String>,
    },
}

impl From<VaultStickyItem> for VaultStickyView {
    fn from(item: VaultStickyItem) -> Self {
        match item {
            VaultStickyItem::Note { path } => Self::Note {
                title: RelPath::parse(&path)
                    .map(|p| p.title().to_owned())
                    .unwrap_or_else(|_| path.clone()),
                path,
            },
            VaultStickyItem::Tasks { view, space } => Self::Tasks {
                view: VaultTaskView::parse(&view).unwrap_or(VaultTaskView::Today),
                space,
            },
        }
    }
}

/// A pinned vault sticky, for the workspace's markers.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultPinned {
    pub target: StickyTarget,
    pub shows: VaultStickyView,
    pub is_open: bool,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultImportStatus {
    /// Piw 0.1 left notes or tasks that were never imported.
    pub pending: bool,
    pub imported_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct VaultImportReport {
    pub notes: usize,
    pub documents: usize,
    pub sections: usize,
    pub tasks: usize,
}
