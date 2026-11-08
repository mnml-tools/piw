//! Shared plumbing for data commands: database access off the UI thread and change events.

use std::sync::Arc;

use rusqlite::{Connection, Transaction};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

use crate::domain::change::{ChangeSet, EVENT_CHANGED};
use crate::error::{AppError, AppResult};
use crate::storage::Database;

/// The opened database, or why it could not be opened (shown by the UI instead of crashing).
pub struct DataState(pub Result<Arc<Database>, String>);

impl DataState {
    fn database(&self) -> AppResult<Arc<Database>> {
        self.0
            .as_ref()
            .map(Arc::clone)
            .map_err(|reason| AppError::Storage(reason.clone()))
    }
}

pub fn database<R: Runtime>(app: &AppHandle<R>) -> AppResult<Arc<Database>> {
    app.state::<DataState>().database()
}

async fn blocking<T: Send + 'static>(
    job: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| AppError::Internal(format!("background task failed: {e}")))?
}

/// Runs a read on a worker thread.
pub async fn read<R: Runtime, T: Send + 'static>(
    app: &AppHandle<R>,
    f: impl FnOnce(&Connection) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    let db = database(app)?;
    blocking(move || db.read(f)).await
}

/// Runs a write transaction on a worker thread, then tells every window what changed.
pub async fn write<R: Runtime, T: Send + 'static>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    f: impl FnOnce(&Transaction<'_>) -> AppResult<(T, ChangeSet)> + Send + 'static,
) -> AppResult<T> {
    let db = database(app)?;
    let (value, changes) = blocking(move || db.write(f)).await?;
    broadcast(app, changes, Some(window.label()));
    Ok(value)
}

pub fn broadcast<R: Runtime>(app: &AppHandle<R>, mut changes: ChangeSet, origin: Option<&str>) {
    if changes.is_empty() {
        return;
    }
    changes.origin = origin.map(str::to_owned);
    if let Err(error) = app.emit(EVENT_CHANGED, changes) {
        log::warn!("could not broadcast changes: {error}");
    }
}
