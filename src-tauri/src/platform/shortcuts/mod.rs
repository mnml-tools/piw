//! Global shortcut that opens Quick Capture.
//!
//! Backends, in order of preference (docs/architecture.md#global-shortcut):
//! 1. XDG Desktop Portal `GlobalShortcuts` on Linux Wayland sessions (KDE Plasma 6, GNOME 48+).
//! 2. The Tauri global-shortcut plugin (X11, Windows, macOS; best effort under XWayland).
//! 3. Always available: tray menu, the workspace "New" actions and `piw --quick-note`, which
//!    users can bind in their desktop environment's own shortcut settings.

mod accelerator;
mod native;
#[cfg(target_os = "linux")]
mod portal;

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use ts_rs::TS;

pub use accelerator::DEFAULT_ACCELERATOR;

use super::env::environment_info;
use super::window::{CaptureMode, show_capture};

pub const EVENT_SHORTCUT_STATUS: &str = "piw://shortcut/status";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum ShortcutBackend {
    Native,
    // Only Linux binds through the portal; the variant stays so the TypeScript type is the same.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    Portal,
}

/// What the user sees in Settings → Shortcuts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[serde(tag = "state", rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum ShortcutStatus {
    Pending,
    Registered {
        accelerator: String,
        backend: ShortcutBackend,
        /// Trigger as described by the desktop (the user may have picked another key).
        #[ts(optional)]
        #[serde(skip_serializing_if = "Option::is_none")]
        trigger: Option<String>,
        /// Set when the backend is known to work only in some situations.
        #[ts(optional)]
        #[serde(skip_serializing_if = "Option::is_none")]
        limitation: Option<String>,
    },
    InUse {
        accelerator: String,
    },
    Invalid {
        accelerator: String,
    },
    Unavailable {
        reason: String,
    },
    Disabled,
}

/// Managed state that tracks the current registration.
pub struct ShortcutManager {
    status: Mutex<ShortcutStatus>,
    accelerator: Mutex<String>,
    #[cfg(target_os = "linux")]
    portal: Mutex<Option<portal::PortalHandle>>,
}

impl Default for ShortcutManager {
    fn default() -> Self {
        Self {
            status: Mutex::new(ShortcutStatus::Pending),
            accelerator: Mutex::new(DEFAULT_ACCELERATOR.to_owned()),
            #[cfg(target_os = "linux")]
            portal: Mutex::new(None),
        }
    }
}

impl ShortcutManager {
    pub fn status(&self) -> ShortcutStatus {
        self.status
            .lock()
            .map(|s| s.clone())
            .unwrap_or(ShortcutStatus::Pending)
    }

    fn set_status<R: Runtime>(&self, app: &AppHandle<R>, status: ShortcutStatus) {
        log::info!("quick capture shortcut: {status:?}");
        if let Ok(mut current) = self.status.lock() {
            *current = status.clone();
        }
        if let Err(error) = app.emit(EVENT_SHORTCUT_STATUS, status) {
            log::warn!("could not broadcast shortcut status: {error}");
        }
    }

    fn accelerator(&self) -> String {
        self.accelerator
            .lock()
            .map(|a| a.clone())
            .unwrap_or_else(|_| DEFAULT_ACCELERATOR.to_owned())
    }
}

/// Plugin to register in the builder; dispatches native shortcut presses.
pub fn native_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    native::plugin(on_triggered)
}

fn on_triggered<R: Runtime>(app: &AppHandle<R>) {
    if let Err(error) = show_capture(app, CaptureMode::Note) {
        log::error!("could not open quick capture: {error}");
    }
}

/// Registers `accelerator` (or disables the shortcut when `None`) with the best backend.
pub fn apply<R: Runtime>(app: &AppHandle<R>, accelerator: Option<String>) {
    let manager = app.state::<ShortcutManager>();
    unregister_all(app);

    let Some(accelerator) = accelerator.filter(|a| !a.trim().is_empty()) else {
        manager.set_status(app, ShortcutStatus::Disabled);
        return;
    };
    if let Ok(mut current) = manager.accelerator.lock() {
        current.clone_from(&accelerator);
    }

    let env = environment_info();
    #[cfg(target_os = "linux")]
    if env.wayland_session && std::env::var_os("PIW_DISABLE_PORTAL").is_none() {
        manager.set_status(app, ShortcutStatus::Pending);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            match portal::bind(app.clone(), &accelerator, on_triggered::<R>).await {
                Ok((handle, trigger)) => {
                    let manager = app.state::<ShortcutManager>();
                    if let Ok(mut slot) = manager.portal.lock() {
                        *slot = Some(handle);
                    }
                    manager.set_status(
                        &app,
                        ShortcutStatus::Registered {
                            accelerator,
                            backend: ShortcutBackend::Portal,
                            trigger,
                            limitation: None,
                        },
                    );
                }
                Err(error) => {
                    log::warn!("portal global shortcut unavailable: {error}");
                    register_native(&app, &accelerator, true);
                }
            }
        });
        return;
    }
    register_native(app, &accelerator, env.wayland_session);
}

fn register_native<R: Runtime>(app: &AppHandle<R>, accelerator: &str, wayland_session: bool) {
    let manager = app.state::<ShortcutManager>();
    let status = match native::register(app, accelerator) {
        Ok(()) => ShortcutStatus::Registered {
            accelerator: accelerator.to_owned(),
            backend: ShortcutBackend::Native,
            trigger: None,
            limitation: wayland_session.then(|| {
                "Wayland may only deliver this shortcut while an X11 window is focused. \
                 Bind `piw --quick-note` in your desktop's shortcut settings for reliable use."
                    .to_owned()
            }),
        },
        Err(native::RegisterError::InUse) => ShortcutStatus::InUse {
            accelerator: accelerator.to_owned(),
        },
        Err(native::RegisterError::Invalid) => ShortcutStatus::Invalid {
            accelerator: accelerator.to_owned(),
        },
        Err(native::RegisterError::Other(reason)) => ShortcutStatus::Unavailable { reason },
    };
    manager.set_status(app, status);
}

fn unregister_all<R: Runtime>(app: &AppHandle<R>) {
    native::unregister_all(app);
    #[cfg(target_os = "linux")]
    {
        let manager = app.state::<ShortcutManager>();
        let handle = manager.portal.lock().ok().and_then(|mut slot| slot.take());
        if let Some(handle) = handle {
            handle.stop();
        }
    }
}

/// Re-applies the current accelerator (e.g. after the user dismissed the portal dialog).
pub fn retry<R: Runtime>(app: &AppHandle<R>) {
    let accelerator = app.state::<ShortcutManager>().accelerator();
    apply(app, Some(accelerator));
}
