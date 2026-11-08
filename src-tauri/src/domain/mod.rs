//! Domain types and pure rules. Nothing here touches SQLite, Tauri or the OS.

pub mod change;
pub mod model;
pub mod text;
pub mod time;

/// New time-ordered identifier (UUIDv7).
pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}
