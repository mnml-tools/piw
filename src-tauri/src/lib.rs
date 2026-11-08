//! Piw desktop application.

mod commands;
mod domain;
mod error;
mod platform;
mod services;
mod storage;

use std::sync::Arc;

use tauri::{App, AppHandle, Manager, RunEvent};

use commands::support::DataState;
use platform::cli::{LaunchAction, parse_args};
use platform::lifecycle::{self, Lifecycle};
use platform::shortcuts::{self, ShortcutManager};
use platform::stickies::StickyRegistry;
use platform::ui_scale::UiScale;
use platform::window::{self, CaptureMode};
use storage::Database;

const DATABASE_FILE: &str = "piw.sqlite3";

/// Every command exposed to the UI. Debug builds add the Phase 1 spike helpers.
#[macro_export]
#[doc(hidden)]
macro_rules! app_commands {
    ($($extra:path),* $(,)?) => {
        tauri::generate_handler![
            $crate::commands::platform::platform_info,
            $crate::commands::platform::hide_capture,
            $crate::commands::platform::open_in_workspace,
            $crate::commands::platform::open_link,
            $crate::commands::platform::retry_shortcut,
            $crate::commands::stickies::open_sticky,
            $crate::commands::stickies::close_sticky,
            $crate::commands::stickies::unpin_sticky,
            $crate::commands::stickies::set_sticky_always_on_top,
            $crate::commands::stickies::set_sticky_color,
            $crate::commands::stickies::get_sticky,
            $crate::commands::stickies::list_pinned,
            $crate::commands::stickies::reset_sticky_positions,
            $crate::commands::platform::quit_app,
            $crate::commands::workspace::app_status,
            $crate::commands::workspace::list_spaces,
            $crate::commands::workspace::create_space,
            $crate::commands::workspace::rename_space,
            $crate::commands::workspace::set_space_color,
            $crate::commands::workspace::set_default_space,
            $crate::commands::workspace::space_item_count,
            $crate::commands::workspace::delete_space,
            $crate::commands::workspace::list_inbox,
            $crate::commands::workspace::inbox_count,
            $crate::commands::workspace::mark_inbox_triaged,
            $crate::commands::workspace::list_trash,
            $crate::commands::workspace::empty_trash,
            $crate::commands::workspace::list_tags,
            $crate::commands::workspace::search,
            $crate::commands::workspace::get_settings,
            $crate::commands::workspace::update_settings,
            $crate::commands::workspace::remember_capture_space,
            $crate::commands::workspace::get_capture_draft,
            $crate::commands::workspace::save_capture_draft,
            $crate::commands::workspace::clear_capture_draft,
            $crate::commands::data::export_data,
            $crate::commands::data::choose_export_folder,
            $crate::commands::data::write_export,
            $crate::commands::data::backup_database,
            $crate::commands::notes::list_notes,
            $crate::commands::notes::get_note,
            $crate::commands::notes::create_note,
            $crate::commands::notes::update_note_text,
            $crate::commands::notes::discard_note_if_empty,
            $crate::commands::notes::set_note_archived,
            $crate::commands::notes::move_note,
            $crate::commands::notes::trash_note,
            $crate::commands::notes::restore_note,
            $crate::commands::notes::purge_note,
            $crate::commands::notes::set_note_triaged,
            $crate::commands::notes::set_note_tags,
            $crate::commands::notes::get_document,
            $crate::commands::notes::get_tab,
            $crate::commands::notes::create_document,
            $crate::commands::notes::convert_note_to_document,
            $crate::commands::notes::revert_document_conversion,
            $crate::commands::notes::create_tab,
            $crate::commands::notes::rename_tab,
            $crate::commands::notes::reorder_tabs,
            $crate::commands::notes::update_tab_content,
            $crate::commands::notes::update_tab_settings,
            $crate::commands::notes::duplicate_tab,
            $crate::commands::notes::delete_tab,
            $crate::commands::notes::restore_tab,
            $crate::commands::notes::trash_document,
            $crate::commands::notes::document_move_preview,
            $crate::commands::notes::set_document_in_sidebar,
            $crate::commands::tasks::list_tasks,
            $crate::commands::tasks::list_document_tasks,
            $crate::commands::tasks::count_completed_tasks,
            $crate::commands::tasks::get_task,
            $crate::commands::tasks::create_task,
            $crate::commands::tasks::update_task_text,
            $crate::commands::tasks::set_task_completed,
            $crate::commands::tasks::set_task_due_date,
            $crate::commands::tasks::move_task,
            $crate::commands::tasks::set_task_document,
            $crate::commands::tasks::reorder_tasks,
            $crate::commands::tasks::trash_task,
            $crate::commands::tasks::restore_task,
            $crate::commands::tasks::purge_task,
            $crate::commands::tasks::set_task_triaged,
            $crate::commands::tasks::set_task_tags,
            $($extra),*
        ]
    };
}

/// Builds and runs the Tauri application.
pub fn run() {
    platform::env::configure_process();

    #[cfg(debug_assertions)]
    let handlers: fn(tauri::ipc::Invoke) -> bool =
        app_commands![commands::spike::spike_broadcast, commands::spike::spike_ack];
    #[cfg(not(debug_assertions))]
    let handlers: fn(tauri::ipc::Invoke) -> bool = app_commands![];

    let builder = tauri::Builder::default()
        // Must be the first plugin so a second launch is forwarded before anything else runs.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            perform(app, parse_args(argv));
        }))
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .max_file_size(2 * 1024 * 1024)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(shortcuts::native_plugin())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![platform::cli::FLAG_HIDDEN]),
        ))
        .manage(Lifecycle::default())
        .manage(ShortcutManager::default())
        .manage(StickyRegistry::default())
        .manage(UiScale::default())
        .manage(commands::data::ExportTarget::default())
        .on_window_event(|window, event| {
            lifecycle::on_window_event(window, event);
            platform::stickies::on_window_event(window, event);
        })
        .setup(setup)
        .invoke_handler(handlers);

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("Piw failed to start: {error}");
            std::process::exit(1);
        }
    };
    app.run(|handle, event| {
        if let RunEvent::ExitRequested { api, code, .. } = &event {
            lifecycle::on_exit_requested(handle, api, *code);
        }
    });
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle();
    let scale = platform::ui_scale::detect();
    log::info!("ui scale: {scale}");
    handle.state::<UiScale>().set(scale);

    let data = open_database(handle);
    let settings = data
        .as_ref()
        .ok()
        .and_then(|db| db.read(services::settings::get).ok())
        .unwrap_or_default();
    app.manage(DataState(data));

    platform::tray::create(handle)?;
    window::ensure_main(handle)?;
    window::ensure_capture(handle)?;
    commands::workspace::apply_settings(handle, &settings, &[]);
    commands::stickies::restore_on_launch(handle);
    perform(handle, parse_args(std::env::args()));
    #[cfg(debug_assertions)]
    commands::spike::start_probe_if_requested(handle);
    Ok(())
}

/// Opens the database in the OS app-data directory (never next to the binary). Failures are
/// kept and shown by the workspace instead of crashing; the data is never modified then.
fn open_database(app: &AppHandle) -> Result<Arc<Database>, String> {
    let path = match std::env::var_os("PIW_DATA_DIR") {
        Some(dir) => std::path::PathBuf::from(dir).join(DATABASE_FILE),
        None => app
            .path()
            .app_data_dir()
            .map_err(|e| format!("no app data directory: {e}"))?
            .join(DATABASE_FILE),
    };
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    db.write(services::spaces::ensure_seeded)
        .map_err(|e| e.to_string())?;
    log::info!("database ready (schema v{})", storage::SCHEMA_VERSION);
    Ok(Arc::new(db))
}

/// Executes a launch action from the command line or a second instance.
fn perform(app: &AppHandle, action: LaunchAction) {
    log::info!("launch action: {action:?}");
    let result = match action {
        LaunchAction::ShowWorkspace => window::show_main(app),
        LaunchAction::StartHidden => Ok(()),
        LaunchAction::QuickNote => window::show_capture(app, CaptureMode::Note),
        LaunchAction::QuickTask => window::show_capture(app, CaptureMode::Task),
    };
    if let Err(error) = result {
        log::error!("launch action {action:?} failed: {error}");
    }
}
