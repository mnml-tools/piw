//! Settings, the Quick Capture draft and the app's status.

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use ts_rs::TS;

use super::support::{read, write};
use crate::domain::change::ChangeSet;
use crate::error::AppResult;
use crate::platform::lifecycle::Lifecycle;
use crate::services::drafts::{self, CaptureDraft};
use crate::services::settings::{self, Settings};

#[tauri::command]
pub async fn get_settings<R: Runtime>(app: AppHandle<R>) -> AppResult<Settings> {
    read(&app, settings::get).await
}

/// Saves a partial settings update and applies its side effects (tray mode, shortcut,
/// autostart) immediately.
#[tauri::command]
pub async fn update_settings<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    patch: Map<String, Value>,
) -> AppResult<Settings> {
    let keys: Vec<String> = patch.keys().cloned().collect();
    let next = write(&app, &window, move |tx| settings::update(tx, patch)).await?;
    apply_settings(&app, &next, &keys);
    Ok(next)
}

/// Applies settings that live outside the database. `keys` limits it to changed settings;
/// an empty slice applies everything (startup).
pub fn apply_settings<R: Runtime>(app: &AppHandle<R>, settings: &Settings, keys: &[String]) {
    let changed = |key: &str| keys.is_empty() || keys.iter().any(|k| k == key);
    if changed("closeToTray") {
        app.state::<Lifecycle>()
            .set_close_to_tray(settings.close_to_tray);
    }
    if changed("captureShortcut") {
        crate::platform::shortcuts::apply(app, settings.capture_shortcut.clone());
    }
    if changed("launchAtLogin") && !keys.is_empty() {
        use tauri_plugin_autostart::ManagerExt;
        let autolaunch = app.autolaunch();
        let result = if settings.launch_at_login {
            autolaunch.enable()
        } else {
            autolaunch.disable()
        };
        if let Err(error) = result {
            log::warn!("could not change launch at login: {error}");
        }
    }
}

#[tauri::command]
pub async fn get_capture_draft<R: Runtime>(app: AppHandle<R>) -> AppResult<Option<CaptureDraft>> {
    read(&app, drafts::get).await
}

#[tauri::command]
pub async fn save_capture_draft<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    draft: CaptureDraft,
) -> AppResult<()> {
    // Drafts are private to the capture window: no change event.
    write(&app, &window, move |tx| {
        drafts::save(tx, &draft).map(|()| ((), ChangeSet::new()))
    })
    .await
}

#[tauri::command]
pub async fn clear_capture_draft<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> AppResult<()> {
    write(&app, &window, |tx| {
        drafts::clear(tx).map(|()| ((), ChangeSet::new()))
    })
    .await
}

/// Startup state for the UI: whether data could be opened, and where it lives.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct AppStatus {
    pub version: String,
    pub data_error: Option<String>,
    pub data_path: Option<String>,
    pub schema_version: u32,
}

#[tauri::command]
pub async fn app_status<R: Runtime>(app: AppHandle<R>) -> AppResult<AppStatus> {
    let state = app.state::<super::support::DataState>();
    let (data_error, data_path) = match &state.0 {
        Ok(db) => (None, db.path().map(|p| p.display().to_string())),
        Err(reason) => (Some(reason.clone()), None),
    };
    Ok(AppStatus {
        version: app.package_info().version.to_string(),
        data_error,
        data_path,
        schema_version: crate::storage::SCHEMA_VERSION,
    })
}
