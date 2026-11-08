//! Runtime state of sticky windows.
//!
//! Window managers do not reliably keep a window's position or "always on top" state across
//! hide/show (KWin re-places remapped windows and drops `_NET_WM_STATE_ABOVE`; see
//! docs/architecture.md#windows). Piw therefore owns that state here and re-applies it every
//! time a sticky becomes visible.

use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewWindow, Window, WindowEvent};

use super::env::{DisplayServer, environment_info};
use super::labels::{StickyTarget, is_sticky};
use super::window::StickyPlacement;
use crate::error::AppResult;

#[derive(Default)]
pub struct StickyRegistry {
    placements: Mutex<HashMap<String, StickyPlacement>>,
    /// Bumped on every move/resize; a save only runs if no newer change arrived (debounce).
    generations: Mutex<HashMap<String, u64>>,
    hidden: AtomicBool,
}

/// Delay before a moved/resized sticky's geometry is written to the database.
const PERSIST_DELAY: Duration = Duration::from_millis(500);

impl StickyRegistry {
    pub fn placement(&self, label: &str) -> Option<StickyPlacement> {
        self.placements.lock().ok()?.get(label).copied()
    }

    pub fn remember(&self, label: &str, placement: StickyPlacement) {
        if let Ok(mut map) = self.placements.lock() {
            map.insert(label.to_owned(), placement);
        }
    }

    fn update(&self, label: &str, change: impl FnOnce(&mut StickyPlacement)) {
        if let Ok(mut map) = self.placements.lock()
            && let Some(placement) = map.get_mut(label)
        {
            change(placement);
        }
    }

    pub fn forget(&self, label: &str) {
        if let Ok(mut map) = self.placements.lock() {
            map.remove(label);
        }
    }

    pub fn group_hidden(&self) -> bool {
        self.hidden.load(Ordering::SeqCst)
    }
}

/// Whether the current display server lets clients position windows.
pub fn can_position_windows() -> bool {
    environment_info().display_server != DisplayServer::Wayland
}

/// Re-applies position and stacking once the window manager has mapped the window.
///
/// Mapping is asynchronous, so a position set right after `show` is overridden by the window
/// manager's own placement. This retries briefly until the position sticks.
pub fn settle<R: Runtime>(window: &WebviewWindow<R>, placement: StickyPlacement) {
    let window = window.clone();
    thread::spawn(move || {
        let target = match (placement.x, placement.y) {
            (Some(x), Some(y)) if can_position_windows() => Some(PhysicalPosition::new(x, y)),
            _ => None,
        };
        for attempt in 0..10 {
            thread::sleep(Duration::from_millis(if attempt == 0 { 50 } else { 100 }));
            if let Some(target) = target
                && let Err(error) = window.set_position(target)
            {
                log::warn!("could not position sticky: {error}");
                return;
            }
            if placement.always_on_top {
                let _ = window.set_always_on_top(true);
            }
            thread::sleep(Duration::from_millis(60));
            let settled = target.is_none_or(|t| window.outer_position().ok() == Some(t));
            if settled && attempt >= 1 {
                return;
            }
        }
        log::warn!("sticky position did not settle; the window manager may be overriding it");
    });
}

pub fn set_always_on_top<R: Runtime>(
    app: &AppHandle<R>,
    target: &StickyTarget,
    enabled: bool,
) -> AppResult<()> {
    let label = target.label();
    let window = super::window::sticky_window(app, target)?;
    window.set_always_on_top(enabled)?;
    app.state::<StickyRegistry>()
        .update(&label, |p| p.always_on_top = enabled);
    Ok(())
}

pub fn toggle_all<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let registry = app.state::<StickyRegistry>();
    let hide = !registry.hidden.load(Ordering::SeqCst);
    for (label, window) in app.webview_windows() {
        if !is_sticky(&label) {
            continue;
        }
        if hide {
            window.hide()?;
        } else {
            window.show()?;
            if let Some(placement) = registry.placement(&label) {
                settle(&window, placement);
            }
        }
    }
    registry.hidden.store(hide, Ordering::SeqCst);
    Ok(())
}

/// Writes the latest geometry of `label` to the database once moves/resizes settle.
fn schedule_persist<R: Runtime>(app: &AppHandle<R>, label: &str) {
    let registry = app.state::<StickyRegistry>();
    let generation = match registry.generations.lock() {
        Ok(mut map) => {
            let entry = map.entry(label.to_owned()).or_insert(0);
            *entry += 1;
            *entry
        }
        Err(_) => return,
    };
    let app = app.clone();
    let label = label.to_owned();
    thread::spawn(move || {
        thread::sleep(PERSIST_DELAY);
        let registry = app.state::<StickyRegistry>();
        let current = registry
            .generations
            .lock()
            .ok()
            .and_then(|m| m.get(&label).copied());
        if current != Some(generation) {
            return;
        }
        let (Some(target), Some(placement)) =
            (StickyTarget::from_label(&label), registry.placement(&label))
        else {
            return;
        };
        let result = crate::commands::support::database(&app).and_then(|db| {
            db.write(|tx| crate::services::stickies::save_geometry(tx, &target, &placement))
        });
        if let Err(error) = result {
            log::warn!("could not save sticky geometry: {error}");
        }
    });
}

/// Tracks moves and resizes (persisted with a short debounce) and treats closing a sticky
/// window from the window manager as "Hide from desktop". Called from the global window hook.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let label = window.label();
    if !is_sticky(label) {
        return;
    }
    let app = window.app_handle();
    let registry = app.state::<StickyRegistry>();
    match event {
        WindowEvent::CloseRequested { .. } => {
            let quitting = app.state::<super::lifecycle::Lifecycle>().is_quitting();
            if let (false, Some(target)) = (quitting, StickyTarget::from_label(label)) {
                let result = crate::commands::support::database(app).and_then(|db| {
                    db.write(|tx| crate::services::stickies::set_open(tx, &target, false))
                });
                match result {
                    Ok(changes) => crate::commands::support::broadcast(app, changes, Some(label)),
                    Err(error) => log::warn!("could not record hidden sticky: {error}"),
                }
            }
        }
        WindowEvent::Moved(position) if can_position_windows() => {
            // Hidden windows report bogus positions on some window managers.
            if window.is_visible().unwrap_or(false) {
                registry.update(label, |p| {
                    p.x = Some(position.x);
                    p.y = Some(position.y);
                });
                schedule_persist(app, label);
            }
        }
        WindowEvent::Resized(size) => {
            // Placement sizes are in CSS pixels: undo both the monitor scale and the UI zoom.
            let scale =
                window.scale_factor().unwrap_or(1.0) * super::window::ui_scale(window.app_handle());
            if size.width > 0 && size.height > 0 {
                registry.update(label, |p| {
                    p.width = f64::from(size.width) / scale;
                    p.height = f64::from(size.height) / scale;
                });
                schedule_persist(app, label);
            }
        }
        WindowEvent::Destroyed => registry.forget(label),
        _ => {}
    }
}
