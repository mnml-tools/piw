//! Spaces, inbox, trash, tags, search, settings and capture-draft commands.

use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use ts_rs::TS;

use super::support::{read, write};
use crate::domain::change::ChangeSet;
use crate::domain::model::{ColorName, InboxItem, Space, Tag, TrashItem};
use crate::error::AppResult;
use crate::platform::lifecycle::Lifecycle;
use crate::services::drafts::{self, CaptureDraft};
use crate::services::search::{self, SearchResults};
use crate::services::settings::{self, Settings};
use crate::services::{inbox, spaces, tags, trash};

#[tauri::command]
pub async fn list_spaces<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<Space>> {
    read(&app, spaces::list).await
}

#[tauri::command]
pub async fn create_space<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    name: String,
    color: Option<ColorName>,
) -> AppResult<Space> {
    write(&app, &window, move |tx| spaces::create(tx, &name, color)).await
}

#[tauri::command]
pub async fn rename_space<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    name: String,
) -> AppResult<Space> {
    write(&app, &window, move |tx| spaces::rename(tx, &id, &name)).await
}

#[tauri::command]
pub async fn set_space_color<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    color: Option<ColorName>,
) -> AppResult<Space> {
    write(&app, &window, move |tx| spaces::set_color(tx, &id, color)).await
}

#[tauri::command]
pub async fn set_default_space<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        spaces::set_default(tx, &id).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn space_item_count<R: Runtime>(app: AppHandle<R>, id: String) -> AppResult<i64> {
    read(&app, move |c| spaces::item_count(c, &id)).await
}

#[tauri::command]
pub async fn delete_space<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    move_to: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        spaces::delete(tx, &id, &move_to).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn list_inbox<R: Runtime>(
    app: AppHandle<R>,
    space_id: Option<String>,
) -> AppResult<Vec<InboxItem>> {
    read(&app, move |c| inbox::list(c, space_id.as_deref())).await
}

#[tauri::command]
pub async fn inbox_count<R: Runtime>(
    app: AppHandle<R>,
    space_id: Option<String>,
) -> AppResult<i64> {
    read(&app, move |c| inbox::count(c, space_id.as_deref())).await
}

#[tauri::command]
pub async fn mark_inbox_triaged<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    space_id: Option<String>,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        inbox::mark_all_triaged(tx, space_id.as_deref()).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn list_trash<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<TrashItem>> {
    read(&app, trash::list).await
}

#[tauri::command]
pub async fn empty_trash<R: Runtime>(app: AppHandle<R>, window: WebviewWindow<R>) -> AppResult<()> {
    write(&app, &window, |tx| trash::empty(tx).map(|c| ((), c))).await?;
    super::stickies::reconcile(&app, None);
    Ok(())
}

#[tauri::command]
pub async fn list_tags<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<Tag>> {
    read(&app, tags::list).await
}

#[tauri::command]
pub async fn search<R: Runtime>(
    app: AppHandle<R>,
    query: String,
    space_id: Option<String>,
) -> AppResult<SearchResults> {
    read(&app, move |c| {
        search::search(c, &query, space_id.as_deref())
    })
    .await
}

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

/// Remembers the space of the last capture. A dedicated command so the capture window does not
/// need permission to change every setting.
#[tauri::command]
pub async fn remember_capture_space<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    space_id: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        crate::services::resolve_space(tx, Some(&space_id))?;
        let mut patch = Map::new();
        patch.insert("lastCaptureSpaceId".into(), Value::String(space_id));
        settings::update(tx, patch).map(|(_, changes)| ((), changes))
    })
    .await
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
