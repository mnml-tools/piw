//! Tauri command handlers. Commands are thin: they run a service on a worker thread, broadcast
//! what changed and map errors to [`crate::error::AppError`].

pub mod platform;
#[cfg(debug_assertions)]
pub mod spike;
pub mod stickies;
pub mod support;
#[cfg(test)]
mod tests;
pub mod vault;
pub mod workspace;
