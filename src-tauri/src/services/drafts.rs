//! Quick Capture draft: survives an accidental close, a crash or a failed save.

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::domain::time::now;
use crate::error::{AppError, AppResult};
use crate::platform::window::CaptureMode;

const CAPTURE: &str = "capture";
const MAX_DRAFT_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct CaptureDraft {
    pub mode: CaptureMode,
    pub text: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub space_id: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub pin: bool,
    #[serde(default)]
    #[ts(optional)]
    pub updated_at: Option<String>,
}

pub fn get(conn: &Connection) -> AppResult<Option<CaptureDraft>> {
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT content, updated_at FROM capture_drafts WHERE id = ?1",
            [CAPTURE],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    Ok(row.and_then(|(content, updated_at)| {
        serde_json::from_str::<CaptureDraft>(&content)
            .ok()
            .map(|draft| CaptureDraft {
                updated_at: Some(updated_at),
                ..draft
            })
    }))
}

/// Saves the draft; an empty draft clears it.
pub fn save(tx: &Transaction<'_>, draft: &CaptureDraft) -> AppResult<()> {
    if draft.text.trim().is_empty() && draft.description.trim().is_empty() {
        return clear(tx);
    }
    let content = serde_json::to_string(&CaptureDraft {
        updated_at: None,
        ..draft.clone()
    })
    .map_err(|e| AppError::Internal(e.to_string()))?;
    if content.len() > MAX_DRAFT_BYTES {
        return Err(AppError::validation("the draft is too large"));
    }
    tx.execute(
        "INSERT INTO capture_drafts (id, content, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at",
        params![CAPTURE, content, now()],
    )?;
    Ok(())
}

pub fn clear(tx: &Transaction<'_>) -> AppResult<()> {
    tx.execute("DELETE FROM capture_drafts WHERE id = ?1", [CAPTURE])?;
    Ok(())
}
