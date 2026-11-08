//! Close-versus-quit behaviour.
//!
//! * Closing the workspace hides it; Piw keeps running in the tray (configurable).
//! * Closing the capture popup hides it, keeping it ready for the next shortcut.
//! * Closing a sticky destroys only that window (the item is untouched).
//! * "Quit" from the tray or the app menu is the only way to exit while the tray is active.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Emitter, Manager, Runtime, Window, WindowEvent};

use super::labels::{CAPTURE, MAIN};
use super::window::{hide_capture, hide_main};

pub const EVENT_HIDDEN_TO_TRAY: &str = "piw://lifecycle/hidden-to-tray";

pub struct Lifecycle {
    quitting: AtomicBool,
    close_to_tray: AtomicBool,
}

impl Default for Lifecycle {
    fn default() -> Self {
        Self {
            quitting: AtomicBool::new(false),
            close_to_tray: AtomicBool::new(true),
        }
    }
}

impl Lifecycle {
    pub fn request_quit(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }

    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }

    pub fn set_close_to_tray(&self, enabled: bool) {
        self.close_to_tray.store(enabled, Ordering::SeqCst);
    }

    pub fn close_to_tray(&self) -> bool {
        self.close_to_tray.load(Ordering::SeqCst)
    }
}

/// Window event hook installed on the builder.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    let app = window.app_handle();
    let lifecycle = app.state::<Lifecycle>();
    if lifecycle.is_quitting() {
        return;
    }
    match window.label() {
        MAIN if lifecycle.close_to_tray() => {
            api.prevent_close();
            if let Err(error) = hide_main(app) {
                log::error!("could not hide workspace: {error}");
            }
            let _ = app.emit_to(MAIN, EVENT_HIDDEN_TO_TRAY, ());
        }
        MAIN => {
            lifecycle.request_quit();
            app.exit(0);
        }
        CAPTURE => {
            api.prevent_close();
            if let Err(error) = hide_capture(app) {
                log::error!("could not hide capture: {error}");
            }
        }
        _ => {}
    }
}

/// Keeps the process alive when the last visible window goes away, unless quitting.
pub fn on_exit_requested<R: Runtime>(
    app: &AppHandle<R>,
    api: &tauri::ExitRequestApi,
    code: Option<i32>,
) {
    let lifecycle = app.state::<Lifecycle>();
    if code.is_none() && !lifecycle.is_quitting() && lifecycle.close_to_tray() {
        api.prevent_exit();
    }
}
