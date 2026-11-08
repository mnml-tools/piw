//! Operating-system integration: windows, shortcuts, tray and lifecycle. Platform differences
//! are isolated here; the rest of the app is platform-agnostic.

pub mod cli;
pub mod env;
pub mod geometry;
pub mod labels;
pub mod lifecycle;
pub mod navigation;
pub mod shortcuts;
pub mod stickies;
pub mod tray;
pub mod ui_scale;
pub mod window;
