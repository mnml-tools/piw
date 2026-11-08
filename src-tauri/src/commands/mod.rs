//! Tauri command handlers. Commands are thin: they run a service on a worker thread inside a
//! transaction, broadcast what changed and map errors to [`crate::error::AppError`].

pub mod data;
pub mod notes;
pub mod platform;
pub mod scope;
#[cfg(debug_assertions)]
pub mod spike;
pub mod stickies;
pub mod support;
pub mod tasks;
#[cfg(test)]
mod tests;
pub mod workspace;
