//! Change notifications broadcast to every window after a committed write.

use serde::Serialize;
use ts_rs::TS;

pub const EVENT_CHANGED: &str = "piw://changed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum EntityKind {
    Settings,
    Sticky,
    /// A note or folder in the vault, by its vault path; `""` for the vault itself (its status,
    /// the trash).
    File,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, TS)]
#[ts(export, export_to = "bindings/")]
pub struct Change {
    pub kind: EntityKind,
    pub id: String,
}

/// The entities touched by one operation. Windows refetch what they display.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct ChangeSet {
    pub changes: Vec<Change>,
    /// Label of the window that caused the change, so it can skip redundant refetches.
    #[ts(optional)]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
}

impl ChangeSet {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, kind: EntityKind, id: impl Into<String>) -> &mut Self {
        let change = Change {
            kind,
            id: id.into(),
        };
        if !self.changes.contains(&change) {
            self.changes.push(change);
        }
        self
    }

    pub fn with(mut self, kind: EntityKind, id: impl Into<String>) -> Self {
        self.add(kind, id);
        self
    }

    pub fn extend(&mut self, other: ChangeSet) {
        for change in other.changes {
            self.add(change.kind, change.id);
        }
    }

    pub fn is_empty(&self) -> bool {
        self.changes.is_empty()
    }
}
