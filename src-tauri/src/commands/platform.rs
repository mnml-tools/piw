//! Window, shortcut and environment commands.

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use ts_rs::TS;

use crate::error::{AppError, AppResult};
use crate::platform::env::{EnvironmentInfo, environment_info};
use crate::platform::geometry::Rect;
use crate::platform::labels::{StickyTarget, is_valid_id};
use crate::platform::lifecycle::Lifecycle;
use crate::platform::shortcuts::{self, ShortcutManager, ShortcutStatus};
use crate::platform::window;

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct MonitorInfo {
    pub name: Option<String>,
    pub scale_factor: f64,
    pub bounds: Rect,
    pub work_area: Rect,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct PlatformInfo {
    pub environment: EnvironmentInfo,
    pub shortcut: ShortcutStatus,
    pub monitors: Vec<MonitorInfo>,
}

#[tauri::command]
pub async fn platform_info<R: Runtime>(
    app: AppHandle<R>,
    shortcuts: State<'_, ShortcutManager>,
) -> AppResult<PlatformInfo> {
    let monitors = app
        .available_monitors()?
        .into_iter()
        .map(|m| {
            let area = m.work_area();
            MonitorInfo {
                name: m.name().cloned(),
                scale_factor: m.scale_factor(),
                bounds: Rect::new(
                    m.position().x,
                    m.position().y,
                    m.size().width,
                    m.size().height,
                ),
                work_area: Rect::new(
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                ),
            }
        })
        .collect();
    Ok(PlatformInfo {
        environment: environment_info(),
        shortcut: shortcuts.status(),
        monitors,
    })
}

#[tauri::command]
pub async fn hide_capture<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    window::hide_capture(&app)
}

/// "Open in Piw" from a sticky: shows the workspace and asks it to navigate to the item.
#[tauri::command]
pub async fn open_in_workspace<R: Runtime>(
    app: AppHandle<R>,
    target: StickyTarget,
) -> AppResult<()> {
    if !is_valid_id(&target.id) {
        return Err(AppError::validation("invalid target id"));
    }
    window::show_main(&app)?;
    app.emit_to(crate::platform::labels::MAIN, EVENT_OPEN, target)?;
    Ok(())
}

/// Opens an http(s) or mailto link in the user's browser or mail client.
#[tauri::command]
pub async fn open_link<R: Runtime>(app: AppHandle<R>, url: String) -> AppResult<()> {
    if !crate::platform::navigation::is_openable_link(&url) {
        return Err(AppError::validation(
            "only web and email links can be opened",
        ));
    }
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| AppError::Platform(e.to_string()))
}

/// Event asking the workspace to show an item (payload: `StickyTarget`).
pub const EVENT_OPEN: &str = "piw://open";

#[tauri::command]
pub async fn retry_shortcut<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    shortcuts::retry(&app);
    Ok(())
}

#[tauri::command]
pub async fn quit_app<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    app.state::<Lifecycle>().request_quit();
    app.exit(0);
    Ok(())
}
