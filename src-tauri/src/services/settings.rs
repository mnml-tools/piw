//! Local preferences, stored as one JSON value per key.

use rusqlite::{Connection, Transaction, params};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use ts_rs::TS;

use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::time::now;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum Theme {
    System,
    Light,
    Dark,
}

/// The accent colours of the shared mnml-tools UI kit (`@mnml-tools/ui`), written to
/// `<html data-accent>`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum Accent {
    Pink,
    Blue,
    Orange,
    Green,
    Purple,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum CaptureSpace {
    /// Always the default space.
    Default,
    /// The space used by the previous capture.
    LastUsed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum TextSize {
    Small,
    Default,
    Large,
}

/// Every preference with its default. Unknown keys in the database are ignored, so older and
/// newer versions can share a database.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct Settings {
    pub theme: Theme,
    pub accent: Accent,
    pub text_size: TextSize,
    /// Closing the workspace hides it to the tray instead of quitting.
    pub close_to_tray: bool,
    pub launch_at_login: bool,
    /// Accelerator for Quick Capture; `null` disables the global shortcut.
    pub capture_shortcut: Option<String>,
    pub capture_space: CaptureSpace,
    pub last_capture_space_id: Option<String>,
    /// Reopen pinned stickies when Piw starts (off by default for privacy).
    pub restore_stickies_on_launch: bool,
    pub tray_notice_shown: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            accent: Accent::Blue,
            text_size: TextSize::Default,
            close_to_tray: true,
            launch_at_login: false,
            capture_shortcut: Some(crate::platform::shortcuts::DEFAULT_ACCELERATOR.to_owned()),
            capture_space: CaptureSpace::LastUsed,
            last_capture_space_id: None,
            restore_stickies_on_launch: false,
            tray_notice_shown: false,
        }
    }
}

pub fn get(conn: &Connection) -> AppResult<Settings> {
    let mut map = match serde_json::to_value(Settings::default()) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    };
    let mut stmt = conn.prepare_cached("SELECT key, value FROM settings")?;
    let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
    for row in rows {
        let (key, value) = row?;
        if map.contains_key(&key)
            && let Ok(value) = serde_json::from_str::<Value>(&value)
        {
            map.insert(key, value);
        }
    }
    // A malformed stored value falls back to defaults instead of breaking startup.
    Ok(
        serde_json::from_value(Value::Object(map.clone())).unwrap_or_else(|error| {
            log::warn!("ignoring invalid stored settings: {error}");
            Settings::default()
        }),
    )
}

/// Applies a partial update (`{"theme": "dark"}`), validating it against [`Settings`].
pub fn update(tx: &Transaction<'_>, patch: Map<String, Value>) -> AppResult<(Settings, ChangeSet)> {
    let current = get(tx)?;
    let mut merged = match serde_json::to_value(&current) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    };
    for (key, value) in &patch {
        if !merged.contains_key(key) {
            return Err(AppError::validation(format!("unknown setting: {key}")));
        }
        merged.insert(key.clone(), value.clone());
    }
    let next: Settings = serde_json::from_value(Value::Object(merged))
        .map_err(|e| AppError::validation(format!("invalid setting value: {e}")))?;
    let ts = now();
    let stored = match serde_json::to_value(&next) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    };
    for key in patch.keys() {
        if let Some(value) = stored.get(key) {
            tx.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![key, value.to_string(), ts],
            )?;
        }
    }
    Ok((next, ChangeSet::new().with(EntityKind::Settings, "*")))
}
