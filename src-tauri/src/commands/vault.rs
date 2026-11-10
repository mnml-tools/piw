//! Vault commands (docs/redesign.md). Each runs on a worker thread and, after a write, tells
//! every window which vault paths changed (`EntityKind::File`). The workspace window has them
//! all; a sticky window only the few that show and edit its own note or task view, checked
//! again here; Quick Capture only what it needs to append to an Inbox.

use std::sync::Arc;

use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use super::stickies::pin_and_show;
use super::support::{blocking, broadcast, read, write};
use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::time::parse_date;
use crate::error::{AppError, AppResult};
use crate::platform::labels::StickyTarget;
use crate::platform::window::CaptureMode;
use crate::services::vault_stickies::{self, VaultStickyItem};
use crate::vault::dto::{
    VaultEntry, VaultImportReport, VaultImportStatus, VaultNote, VaultPinned, VaultRenamed,
    VaultSearchHit, VaultStatus, VaultStickyView, VaultTask, VaultTaskChange, VaultTaskView,
    VaultTrashItem,
};
use crate::vault::paths::RelPath;
use crate::vault::{InboxEntry, SyncReport, TaskRef, Vault, VaultPhase, VaultSlot, import};

/// Most hits a search returns.
const SEARCH_HITS: usize = 50;

fn vault<R: Runtime>(app: &AppHandle<R>) -> AppResult<Arc<Vault>> {
    app.try_state::<VaultSlot>()
        .ok_or(AppError::NotFound { entity: "vault" })?
        .vault()
}

async fn run<R: Runtime, T: Send + 'static>(
    app: &AppHandle<R>,
    job: impl FnOnce(&Vault) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    let vault = vault(app)?;
    blocking(move || job(&vault)).await
}

fn path(value: &str) -> AppResult<RelPath> {
    RelPath::parse(value)
}

fn optional_path(value: Option<String>) -> AppResult<Option<RelPath>> {
    value.as_deref().map(path).transpose()
}

/// What a call from a sticky window is about to touch.
enum Reach<'a> {
    /// One note: a note sticky's own, or one listed by a task sticky.
    Note(&'a RelPath),
    /// A task view's list.
    Tasks,
    /// What a sticky shows.
    Sticky(&'a StickyTarget),
    /// A capture into this space's Inbox (a task sticky of that space adds its tasks there).
    Capture(Option<&'a str>),
}

/// A sticky window may only reach its own note or task view (`vault_stickies` says which).
/// Other windows are not limited here.
async fn check_sticky<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    reach: Reach<'_>,
) -> AppResult<()> {
    let Some(own) = StickyTarget::from_label(window.label()) else {
        return Ok(());
    };
    let lookup = own.clone();
    let shows = read(app, move |c| vault_stickies::item(c, &lookup)).await?;
    let allowed = match (&shows, reach) {
        (_, Reach::Sticky(target)) => *target == own,
        (Some((_, VaultStickyItem::Note { path })), Reach::Note(asked)) => path == asked.as_str(),
        (Some((_, VaultStickyItem::Tasks { .. })), Reach::Note(_) | Reach::Tasks) => true,
        (Some((_, VaultStickyItem::Tasks { space, .. })), Reach::Capture(asked)) => {
            space.is_some() && space.as_deref() == asked
        }
        _ => false,
    };
    if allowed {
        Ok(())
    } else {
        Err(AppError::validation(
            "this window can only access its own item",
        ))
    }
}

fn root_of(vault: &Vault) -> String {
    vault.root().to_string_lossy().into_owned()
}

/// The `piw://changed` set for vault paths.
pub fn file_changes<'a>(paths: impl IntoIterator<Item = &'a RelPath>) -> ChangeSet {
    let mut changes = ChangeSet::new();
    for path in paths {
        changes.add(EntityKind::File, path.as_str());
    }
    changes
}

pub fn report_changes(report: &SyncReport) -> ChangeSet {
    file_changes(report.changed.iter().chain(&report.removed))
}

/// Tells every window the vault itself changed (it opened, or its trash did).
pub fn vault_changed() -> ChangeSet {
    ChangeSet::new().with(EntityKind::File, "")
}

#[tauri::command]
pub fn vault_status<R: Runtime>(app: AppHandle<R>) -> AppResult<VaultStatus> {
    app.try_state::<VaultSlot>()
        .ok_or(AppError::NotFound { entity: "vault" })?
        .status()
}

#[tauri::command]
pub async fn vault_tree<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<VaultEntry>> {
    run(&app, |vault| {
        Ok(vault.tree()?.into_iter().map(VaultEntry::from).collect())
    })
    .await
}

#[tauri::command]
pub async fn vault_read_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    path: String,
) -> AppResult<VaultNote> {
    let path = self::path(&path)?;
    check_sticky(&app, &window, Reach::Note(&path)).await?;
    run(&app, move |vault| vault.read(&path).map(VaultNote::from)).await
}

#[tauri::command]
pub async fn vault_write_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    path: String,
    text: String,
    expected_hash: String,
) -> AppResult<VaultNote> {
    let path = self::path(&path)?;
    check_sticky(&app, &window, Reach::Note(&path)).await?;
    let note = run(&app, move |vault| vault.write(&path, &text, &expected_hash)).await?;
    broadcast(&app, file_changes([&note.path]), Some(window.label()));
    Ok(note.into())
}

#[tauri::command]
pub async fn vault_create_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    folder: Option<String>,
    title: String,
    text: String,
) -> AppResult<VaultNote> {
    let folder = optional_path(folder)?;
    let note = run(&app, move |vault| {
        vault.create_note(folder.as_ref(), &title, &text)
    })
    .await?;
    broadcast(&app, file_changes([&note.path]), Some(window.label()));
    Ok(note.into())
}

#[tauri::command]
pub async fn vault_create_folder<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    parent: Option<String>,
    name: String,
) -> AppResult<String> {
    let parent = optional_path(parent)?;
    let folder = run(&app, move |vault| {
        vault.create_folder(parent.as_ref(), &name)
    })
    .await?;
    broadcast(&app, file_changes([&folder]), Some(window.label()));
    Ok(folder.to_string())
}

/// Renames or moves a note or folder; links to a renamed note follow it.
#[tauri::command]
pub async fn vault_rename<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    from: String,
    to: String,
) -> AppResult<VaultRenamed> {
    let from = path(&from)?;
    let to = path(&to)?;
    let source = from.clone();
    let (renamed, root) = run(&app, move |vault| {
        Ok((vault.rename(&from, &to)?, root_of(vault)))
    })
    .await?;
    // Stickies of the moved notes follow them (device state, in the database).
    let (old, new) = (source.to_string(), renamed.path.to_string());
    write(&app, &window, move |tx| {
        vault_stickies::renamed(tx, &root, &old, &new).map(|c| ((), c))
    })
    .await?;
    let mut changes = report_changes(&renamed.report);
    changes.extend(file_changes(
        [&source, &renamed.path].into_iter().chain(&renamed.linked),
    ));
    broadcast(&app, changes, Some(window.label()));
    Ok(VaultRenamed {
        path: renamed.path.to_string(),
        linked: renamed.linked.iter().map(ToString::to_string).collect(),
    })
}

#[tauri::command]
pub async fn vault_trash<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    path: String,
) -> AppResult<VaultTrashItem> {
    let path = self::path(&path)?;
    let entry = run(&app, move |vault| vault.trash(&path)).await?;
    let mut changes = file_changes([&entry.path]);
    changes.extend(vault_changed());
    broadcast(&app, changes, Some(window.label()));
    Ok(entry.into())
}

#[tauri::command]
pub async fn vault_list_trash<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<VaultTrashItem>> {
    run(&app, |vault| {
        Ok(vault
            .trash_entries()?
            .into_iter()
            .map(VaultTrashItem::from)
            .collect())
    })
    .await
}

/// Puts a trashed item back; resolves to where it went (a free name if the old one is taken).
#[tauri::command]
pub async fn vault_restore<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<String> {
    let restored = run(&app, move |vault| vault.restore(&id)).await?;
    let mut changes = file_changes([&restored]);
    changes.extend(vault_changed());
    broadcast(&app, changes, Some(window.label()));
    Ok(restored.to_string())
}

#[tauri::command]
pub async fn vault_purge<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<()> {
    run(&app, move |vault| vault.purge(&id)).await?;
    broadcast(&app, vault_changed(), Some(window.label()));
    Ok(())
}

/// Notes matching `query`, best first; `space` keeps the hits inside one top-level folder.
#[tauri::command]
pub async fn vault_search<R: Runtime>(
    app: AppHandle<R>,
    query: String,
    space: Option<String>,
) -> AppResult<Vec<VaultSearchHit>> {
    run(&app, move |vault| {
        Ok(vault
            .index()
            .search(&query)?
            .into_iter()
            .filter(|hit| space.is_none() || hit.path.space() == space.as_deref())
            .take(SEARCH_HITS)
            .map(VaultSearchHit::from)
            .collect())
    })
    .await
}

/// The note a `[[link]]` target names now, if any.
#[tauri::command]
pub async fn vault_resolve_link<R: Runtime>(
    app: AppHandle<R>,
    target: String,
) -> AppResult<Option<String>> {
    run(&app, move |vault| {
        Ok(vault.index().resolve(&target)?.map(|p| p.to_string()))
    })
    .await
}

/// A task view's tasks; `today` is the caller's local date.
#[tauri::command]
pub async fn vault_tasks<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    view: VaultTaskView,
    space: Option<String>,
    today: String,
) -> AppResult<Vec<VaultTask>> {
    let today = parse_date(&today)?;
    check_sticky(&app, &window, Reach::Tasks).await?;
    run(&app, move |vault| {
        Ok(vault
            .index()
            .tasks(view.into(), today, space.as_deref())?
            .into_iter()
            .map(VaultTask::from)
            .collect())
    })
    .await
}

/// Ticks, dates or rewords one task's line; resolves to the note's new hash.
#[tauri::command]
pub async fn vault_edit_task<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    path: String,
    line: u32,
    line_text: String,
    file_hash: String,
    change: VaultTaskChange,
) -> AppResult<String> {
    let path = self::path(&path)?;
    check_sticky(&app, &window, Reach::Note(&path)).await?;
    let change = change.parse()?;
    let task = TaskRef {
        line,
        line_text,
        file_hash,
    };
    let note = run(&app, move |vault| vault.edit_task(&path, &task, &change)).await?;
    broadcast(&app, file_changes([&note.path]), Some(window.label()));
    Ok(note.hash)
}

/// Pin to desktop: a sticky for a vault note. Resolves to how many stickies are open.
#[tauri::command]
pub async fn vault_pin_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    path: String,
) -> AppResult<usize> {
    let path = self::path(&path)?;
    let (root, path) = run(&app, move |vault| {
        vault.read(&path)?;
        Ok((root_of(vault), path.to_string()))
    })
    .await?;
    pin_vault_item(&app, &window, root, VaultStickyItem::Note { path }).await
}

/// Pin to desktop: a sticky for a task view and its space filter.
#[tauri::command]
pub async fn vault_pin_tasks<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    view: VaultTaskView,
    space: Option<String>,
) -> AppResult<usize> {
    let root = run(&app, |vault| Ok(root_of(vault))).await?;
    let item = VaultStickyItem::Tasks {
        view: view.as_str().to_owned(),
        space,
    };
    pin_vault_item(&app, &window, root, item).await
}

async fn pin_vault_item<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
    root: String,
    item: VaultStickyItem,
) -> AppResult<usize> {
    let target = write(app, window, move |tx| {
        Ok((
            vault_stickies::target_for(tx, &root, &item)?,
            ChangeSet::new(),
        ))
    })
    .await?;
    pin_and_show(app, window, target).await
}

/// What a vault sticky shows (its window asks for its own).
#[tauri::command]
pub async fn vault_sticky_view<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    target: StickyTarget,
) -> AppResult<VaultStickyView> {
    check_sticky(&app, &window, Reach::Sticky(&target)).await?;
    read(&app, move |c| vault_stickies::item(c, &target))
        .await?
        .map(|(_, item)| item.into())
        .ok_or(AppError::NotFound { entity: "sticky" })
}

/// The vault's pinned stickies, for the markers in the tree and the views.
#[tauri::command]
pub async fn vault_pinned<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<VaultPinned>> {
    let root = run(&app, |vault| Ok(root_of(vault))).await?;
    let pinned = read(&app, move |c| vault_stickies::pinned(c, &root)).await?;
    Ok(pinned
        .into_iter()
        .map(|p| VaultPinned {
            target: p.target,
            shows: p.item.into(),
            is_open: p.is_open,
        })
        .collect())
}

/// Quick Capture into the vault: appends to `<space>/Inbox.md`; resolves to that path.
#[tauri::command]
pub async fn vault_capture<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    space: Option<String>,
    mode: CaptureMode,
    text: String,
    description: String,
    due: Option<String>,
) -> AppResult<String> {
    let entry = match mode {
        CaptureMode::Note => InboxEntry::Note(
            [text.as_str(), description.as_str()]
                .into_iter()
                .filter(|part| !part.trim().is_empty())
                .collect::<Vec<_>>()
                .join("\n"),
        ),
        CaptureMode::Task => InboxEntry::Task {
            text,
            description,
            due: due.as_deref().map(parse_date).transpose()?,
        },
    };
    check_sticky(&app, &window, Reach::Capture(space.as_deref())).await?;
    let note = run(&app, move |vault| vault.capture(space.as_deref(), &entry)).await?;
    broadcast(&app, file_changes([&note.path]), Some(window.label()));
    Ok(note.path.to_string())
}

/// "Create sticky from selection": a new note in the space's Stickies folder that links back
/// to `path`; resolves to the new note's path (pin it next).
#[tauri::command]
pub async fn vault_sticky_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    path: String,
    title: String,
    text: String,
) -> AppResult<String> {
    let source = self::path(&path)?;
    let note = run(&app, move |vault| {
        vault.create_sticky_note(&source, &title, &text)
    })
    .await?;
    broadcast(&app, file_changes([&note.path]), Some(window.label()));
    Ok(note.path.to_string())
}

/// Opens the vault at `root` on a background thread: index, Piw 0.1 import (only into a vault
/// with no notes yet), watcher; then tells every window it is ready.
pub fn launch<R: Runtime>(app: &AppHandle<R>, root: std::path::PathBuf) {
    let app = app.clone();
    let started = std::thread::Builder::new()
        .name("vault-start".into())
        .spawn(move || {
            let watcher_app = app.clone();
            let on_change = move |report: SyncReport| {
                broadcast(&watcher_app, report_changes(&report), None);
            };
            let started =
                data_dir(&app).and_then(|data| crate::vault::start(&root, &data, on_change));
            let phase = match started {
                Ok(state) => {
                    import_on_first_use(&app, &state.vault);
                    VaultPhase::Ready(state)
                }
                Err(error) => {
                    log::error!("vault not started ({:?})", error.code());
                    VaultPhase::Failed {
                        root,
                        reason: error.to_string(),
                    }
                }
            };
            if let Some(slot) = app.try_state::<VaultSlot>()
                && slot.set(phase).is_ok()
            {
                broadcast(&app, vault_changed(), None);
            }
        });
    if let Err(error) = started {
        log::error!("vault not started: {error}");
    }
}

fn data_dir<R: Runtime>(app: &AppHandle<R>) -> AppResult<std::path::PathBuf> {
    match std::env::var_os("PIW_DATA_DIR") {
        Some(dir) => Ok(std::path::PathBuf::from(dir)),
        None => app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Storage(format!("no app data directory: {e}"))),
    }
}

fn import_on_first_use<R: Runtime>(app: &AppHandle<R>, vault: &Vault) {
    let Ok(db) = super::support::database(app) else {
        return;
    };
    let empty = vault.index().notes().map(|n| n.is_empty()).unwrap_or(false);
    if !empty || !db.read(import::pending).unwrap_or(false) {
        return;
    }
    match run_import(&db, vault) {
        Ok(report) => log::info!(
            "imported Piw 0.1: {} notes, {} documents, {} sections, {} tasks",
            report.notes,
            report.documents,
            report.sections,
            report.tasks
        ),
        Err(error) => log::error!("Piw 0.1 import failed ({:?})", error.code()),
    }
}

fn run_import(db: &crate::storage::Database, vault: &Vault) -> AppResult<import::ImportReport> {
    let imported = db.read(|c| import::import(c, vault))?;
    let root = root_of(vault);
    db.write(|tx| import::finish(tx, &root, &imported.stickies).map(|_| ()))?;
    Ok(imported.report)
}

/// Whether Piw 0.1 left notes or tasks to import, and when they were imported.
#[tauri::command]
pub async fn vault_import_status<R: Runtime>(app: AppHandle<R>) -> AppResult<VaultImportStatus> {
    read(&app, |c| {
        Ok(VaultImportStatus {
            pending: import::pending(c)?,
            imported_at: crate::services::settings::get(c)?.vault_imported_at,
        })
    })
    .await
}

/// Imports Piw 0.1's notes and tasks into the vault now (files get free names).
#[tauri::command]
pub async fn vault_import<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> AppResult<VaultImportReport> {
    let db = super::support::database(&app)?;
    let report = run(&app, move |vault| run_import(&db, vault)).await?;
    let mut changes = file_changes(&report.files);
    changes.extend(vault_changed());
    changes.add(EntityKind::Settings, "vaultImportedAt");
    changes.add(EntityKind::Sticky, "*");
    broadcast(&app, changes, Some(window.label()));
    Ok(VaultImportReport {
        notes: report.notes,
        documents: report.documents,
        sections: report.sections,
        tasks: report.tasks,
    })
}

/// Settings › Data › "Change folder…": a native folder picker; the vault there opens (and is
/// remembered). Resolves to the new folder, or `null` when cancelled.
#[tauri::command]
pub async fn choose_vault_folder<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> AppResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let dialog = app.dialog().file().set_title("Choose the vault folder");
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let Some(root) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    let shown = root.display().to_string();
    let stored = shown.clone();
    write(&app, &window, move |tx| {
        let mut patch = serde_json::Map::new();
        patch.insert("vaultPath".into(), serde_json::Value::String(stored));
        crate::services::settings::update(tx, patch).map(|(_, c)| ((), c))
    })
    .await?;
    if let Some(slot) = app.try_state::<VaultSlot>() {
        slot.set(VaultPhase::Starting { root: root.clone() })?;
    }
    broadcast(&app, vault_changed(), Some(window.label()));
    launch(&app, root);
    Ok(Some(shown))
}
