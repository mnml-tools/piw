//! Sticky window commands: Pin, Hide, Remove, Keep on top and colour are distinct actions
//! (docs/ui-design-system.md §17 rule 9). The database is the source of truth; windows follow it.

use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};

use super::support::{database, read, write};
use crate::domain::model::ColorName;
use crate::error::{AppError, AppResult};
use crate::platform::labels::{StickyTarget, is_valid_id};
use crate::platform::stickies::StickyRegistry;
use crate::platform::window;
use crate::services::stickies::{self, PinnedItem, StickyRecord};

fn validate(target: &StickyTarget) -> AppResult<()> {
    if is_valid_id(&target.id) {
        Ok(())
    } else {
        Err(AppError::validation("invalid sticky target id"))
    }
}

fn open_window<R: Runtime>(
    app: &AppHandle<R>,
    target: &StickyTarget,
    record: &StickyRecord,
) -> AppResult<()> {
    window::open_sticky(app, target, record.placement).map(|_| ())
}

/// Pin to desktop: pins the item (if needed) and shows its window. Returns how many stickies
/// are open so the UI can warn when many are open (each costs memory; see
/// docs/architecture.md#windows).
#[tauri::command]
pub async fn open_sticky<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    target: StickyTarget,
) -> AppResult<usize> {
    validate(&target)?;
    let target_for_db = target.clone();
    let record = write(&app, &window, move |tx| stickies::pin(tx, &target_for_db)).await?;
    open_window(&app, &target, &record)?;
    let count = open_count(&app);
    if count > SOFT_LIMIT {
        let _ = app.emit_to(crate::platform::labels::MAIN, EVENT_MANY_STICKIES, count);
    }
    Ok(count)
}

/// Above this many open stickies the workspace shows a gentle memory warning (each sticky is a
/// web view; ~100 MiB each on WebKitGTK, see docs/architecture.md#windows).
pub const SOFT_LIMIT: usize = 8;
pub const EVENT_MANY_STICKIES: &str = "piw://stickies/many";

fn open_count<R: Runtime>(app: &AppHandle<R>) -> usize {
    app.webview_windows()
        .keys()
        .filter(|l| crate::platform::labels::is_sticky(l))
        .count()
}

/// Hide from desktop: closes the window, keeps the item pinned (listed in Pinned).
#[tauri::command]
pub async fn close_sticky<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    target: StickyTarget,
) -> AppResult<()> {
    validate(&target)?;
    let t = target.clone();
    write(&app, &window, move |tx| {
        stickies::set_open(tx, &t, false).map(|c| ((), c))
    })
    .await?;
    window::close_sticky(&app, &target)
}

/// Remove from Pinned (and from the desktop). The item itself is untouched.
#[tauri::command]
pub async fn unpin_sticky<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    target: StickyTarget,
) -> AppResult<()> {
    validate(&target)?;
    let t = target.clone();
    write(&app, &window, move |tx| {
        stickies::unpin(tx, &t).map(|c| ((), c))
    })
    .await?;
    window::close_sticky(&app, &target)
}

#[tauri::command]
pub async fn set_sticky_always_on_top<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    target: StickyTarget,
    enabled: bool,
) -> AppResult<()> {
    validate(&target)?;
    let t = target.clone();
    write(&app, &window, move |tx| {
        stickies::set_always_on_top(tx, &t, enabled).map(|c| ((), c))
    })
    .await?;
    if window::sticky_window(&app, &target).is_ok() {
        crate::platform::stickies::set_always_on_top(&app, &target, enabled)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_sticky_color<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    target: StickyTarget,
    color: Option<ColorName>,
) -> AppResult<()> {
    validate(&target)?;
    write(&app, &window, move |tx| {
        stickies::set_color(tx, &target, color).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn get_sticky<R: Runtime>(
    app: AppHandle<R>,
    target: StickyTarget,
) -> AppResult<Option<StickyRecord>> {
    validate(&target)?;
    read(&app, move |c| stickies::get(c, &target)).await
}

#[tauri::command]
pub async fn list_pinned<R: Runtime>(
    app: AppHandle<R>,
    space_id: Option<String>,
) -> AppResult<Vec<PinnedItem>> {
    read(&app, move |c| stickies::list(c, space_id.as_deref())).await
}

/// Forgets saved positions and lets the window manager place open stickies again.
#[tauri::command]
pub async fn reset_sticky_positions<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
) -> AppResult<()> {
    write(&app, &window, |tx| {
        stickies::reset_positions(tx).map(|c| ((), c))
    })
    .await?;
    let open: Vec<String> = app
        .webview_windows()
        .into_keys()
        .filter(|l| crate::platform::labels::is_sticky(l))
        .collect();
    for label in open {
        if let Some(target) = StickyTarget::from_label(&label) {
            window::close_sticky(&app, &target)?;
            let record = read(&app, {
                let target = target.clone();
                move |c| stickies::get(c, &target)
            })
            .await?;
            if let Some(record) = record {
                open_window(&app, &target, &record)?;
            }
        }
    }
    Ok(())
}

/// Closes windows whose item went to Trash (the pin is kept so Undo can bring them back) and
/// reopens a restored item's sticky if it was open before.
pub fn reconcile<R: Runtime>(app: &AppHandle<R>, restored: Option<&StickyTarget>) {
    let Ok(db) = database(app) else { return };
    let pinned: Vec<PinnedItem> = db.read(|c| stickies::list(c, None)).unwrap_or_default();
    for label in app.webview_windows().into_keys() {
        let Some(target) = StickyTarget::from_label(&label) else {
            continue;
        };
        if !pinned.iter().any(|item| item.target == target) {
            let _ = window::close_sticky(app, &target);
            app.state::<StickyRegistry>().forget(&label);
        }
    }
    if let Some(target) = restored
        && let Some(item) = pinned
            .iter()
            .find(|item| &item.target == target && item.is_open)
        && let Ok(Some(record)) = db.read(|c| stickies::get(c, &item.target))
    {
        let _ = open_window(app, target, &record);
    }
}

/// Reopens stickies that were open when Piw last quit — only if the user enabled it.
pub fn restore_on_launch<R: Runtime>(app: &AppHandle<R>) {
    let Ok(db) = database(app) else { return };
    let enabled = db
        .read(crate::services::settings::get)
        .map(|s| s.restore_stickies_on_launch)
        .unwrap_or(false);
    if !enabled {
        return;
    }
    match db.read(stickies::open_on_launch) {
        Ok(items) => {
            for (target, record) in items {
                if let Err(error) = open_window(app, &target, &record) {
                    log::warn!("could not restore a sticky: {error}");
                }
            }
        }
        Err(error) => log::warn!("could not read stickies: {error}"),
    }
}
