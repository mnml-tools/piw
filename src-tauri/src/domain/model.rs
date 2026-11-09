//! Data transfer types shared with the UI (TypeScript bindings via ts-rs).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

macro_rules! str_enum {
    ($(#[$meta:meta])* $name:ident { $($variant:ident = $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
        #[serde(rename_all = "snake_case")]
        #[ts(export, export_to = "bindings/")]
        pub enum $name { $($variant),+ }

        impl $name {
            pub fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $text),+ }
            }

            pub fn parse(value: &str) -> Option<Self> {
                match value { $($text => Some(Self::$variant),)+ _ => None }
            }
        }

        impl rusqlite::types::FromSql for $name {
            fn column_result(value: rusqlite::types::ValueRef<'_>) -> rusqlite::types::FromSqlResult<Self> {
                let text = value.as_str()?;
                Self::parse(text).ok_or_else(|| rusqlite::types::FromSqlError::Other(
                    format!("unexpected {} value: {text}", stringify!($name)).into(),
                ))
            }
        }

        impl rusqlite::types::ToSql for $name {
            fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
                Ok(self.as_str().into())
            }
        }
    };
}

str_enum!(NoteKind { QuickNote = "quick_note", Document = "document" });
str_enum!(TabKind { Content = "content", Tasks = "tasks" });
str_enum!(TaskStatus { Open = "open", Completed = "completed" });
str_enum!(
    /// Named colours for spaces and stickies (tokens `--sticky-<name>-*`).
    ColorName { Yellow = "yellow", Peach = "peach", Rose = "rose", Mint = "mint", Sky = "sky", Lavender = "lavender" }
);
str_enum!(TasksTabShow { Open = "open", All = "all", Completed = "completed" });
str_enum!(TasksTabSort { Manual = "manual", DueDate = "due_date" });

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct Space {
    pub id: String,
    pub name: String,
    pub color: Option<ColorName>,
    pub sort_order: i64,
    pub is_default: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// A quick note or a document, as stored.
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct Note {
    pub id: String,
    pub space_id: String,
    pub kind: NoteKind,
    /// Explicit title; may be empty for quick notes (see `displayTitle`).
    pub title: String,
    /// Title for display: explicit, or inferred from the first line of the body.
    pub display_title: String,
    /// Quick-note text; `null` for documents.
    pub body: Option<String>,
    pub document_id: Option<String>,
    pub document_title: Option<String>,
    pub sidebar_order: Option<i64>,
    pub rev: i64,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub triaged_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
}

/// Lightweight row for lists (no full body).
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct NoteListItem {
    pub id: String,
    pub space_id: String,
    pub kind: NoteKind,
    pub display_title: String,
    pub excerpt: String,
    pub document_id: Option<String>,
    pub document_title: Option<String>,
    pub sidebar_order: Option<i64>,
    pub tags: Vec<String>,
    pub pinned: bool,
    /// Number of tasks linked to a document (0 for quick notes).
    pub task_count: i64,
    /// Checklist items (`- [ ]`, `- [x]`) in a quick note's text, and how many are ticked.
    /// Editorial only, never real tasks; 0 for documents.
    pub checklist_count: i64,
    pub checklist_done: i64,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct TasksTabSettings {
    pub show: TasksTabShow,
    pub sort: TasksTabSort,
}

impl Default for TasksTabSettings {
    fn default() -> Self {
        Self {
            show: TasksTabShow::Open,
            sort: TasksTabSort::Manual,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct Tab {
    pub id: String,
    pub document_id: String,
    pub title: String,
    pub kind: TabKind,
    pub sort_order: i64,
    /// ProseMirror JSON for content tabs (string, parsed by the editor).
    pub content_json: Option<String>,
    pub settings: TasksTabSettings,
    pub rev: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct Document {
    pub note: Note,
    pub tabs: Vec<Tab>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct Task {
    pub id: String,
    pub space_id: String,
    pub document_id: Option<String>,
    pub document_title: Option<String>,
    pub document_archived: bool,
    pub parent_task_id: Option<String>,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub due_date: Option<String>,
    pub completed_at: Option<String>,
    pub sort_order: i64,
    pub rev: i64,
    pub subtask_count: i64,
    pub subtask_done: i64,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub triaged_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct TaskDetail {
    pub task: Task,
    pub subtasks: Vec<Task>,
    pub parent_title: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum InboxItem {
    Note { note: NoteListItem },
    Task { task: Task },
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub usage: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[serde(tag = "type", rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum TrashItem {
    Note { note: NoteListItem },
    Task { task: Task },
}
