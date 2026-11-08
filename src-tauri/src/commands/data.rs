//! Export and backup commands. The user picks folders/files in native dialogs opened by Rust,
//! so the UI never chooses filesystem paths itself (least privilege).

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_dialog::DialogExt;

use super::support::{database, read};
use crate::error::{AppError, AppResult};
use crate::services::export::{self, ExportData, ExportFile};

/// Folder chosen by the last `choose_export_folder`, consumed by `write_export`.
#[derive(Default)]
pub struct ExportTarget(Mutex<Option<PathBuf>>);

#[tauri::command]
pub async fn export_data<R: Runtime>(app: AppHandle<R>) -> AppResult<ExportData> {
    let version = app.package_info().version.to_string();
    read(&app, move |c| export::gather(c, &version)).await
}

/// Asks where to export. Resolves to the folder shown to the user, or `null` if cancelled.
#[tauri::command]
pub async fn choose_export_folder<R: Runtime>(app: AppHandle<R>) -> AppResult<Option<String>> {
    let dialog = app.dialog().file().set_title("Export Piw data");
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let path = picked.and_then(|p| p.into_path().ok());
    let shown = path.as_ref().map(|p| p.display().to_string());
    if let Ok(mut slot) = app.state::<ExportTarget>().0.lock() {
        *slot = path;
    }
    Ok(shown)
}

/// Writes the export into a new folder inside the chosen one; returns its path.
#[tauri::command]
pub async fn write_export<R: Runtime>(
    app: AppHandle<R>,
    folder_name: String,
    files: Vec<ExportFile>,
) -> AppResult<String> {
    let parent = app
        .state::<ExportTarget>()
        .0
        .lock()
        .ok()
        .and_then(|mut slot| slot.take())
        .ok_or_else(|| AppError::validation("choose a folder first"))?;
    let written = tauri::async_runtime::spawn_blocking(move || {
        export::write_export(&parent, &folder_name, &files)
    })
    .await
    .map_err(|e| AppError::Internal(e.to_string()))??;
    log::info!("export written");
    Ok(written.display().to_string())
}

/// Saves a complete, consistent copy of the database. Resolves to its path, or `null`.
#[tauri::command]
pub async fn backup_database<R: Runtime>(app: AppHandle<R>) -> AppResult<Option<String>> {
    let name = format!(
        "piw-backup-{}.sqlite3",
        chrono::Local::now().format("%Y-%m-%d")
    );
    let dialog = app
        .dialog()
        .file()
        .set_title("Back up Piw data")
        .set_file_name(name)
        .add_filter("Piw backup", &["sqlite3"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_save_file())
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let Some(target) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    let db = database(&app)?;
    let shown = target.display().to_string();
    tauri::async_runtime::spawn_blocking(move || db.read(|c| export::backup(c, &target)))
        .await
        .map_err(|e| AppError::Internal(e.to_string()))??;
    log::info!("backup written");
    Ok(Some(shown))
}
