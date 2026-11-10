//! Piw desktop application.

mod commands;
mod domain;
mod error;
mod platform;
mod services;
mod storage;
mod vault;

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
            $crate::commands::platform::show_capture,
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
            $crate::commands::stickies::reset_sticky_positions,
            $crate::commands::platform::quit_app,
            $crate::commands::workspace::app_status,
            $crate::commands::workspace::get_settings,
            $crate::commands::workspace::update_settings,
            $crate::commands::workspace::get_capture_draft,
            $crate::commands::workspace::save_capture_draft,
            $crate::commands::workspace::clear_capture_draft,
            $crate::commands::vault::vault_status,
            $crate::commands::vault::vault_tree,
            $crate::commands::vault::vault_read_note,
            $crate::commands::vault::vault_write_note,
            $crate::commands::vault::vault_create_note,
            $crate::commands::vault::vault_create_folder,
            $crate::commands::vault::vault_rename,
            $crate::commands::vault::vault_trash,
            $crate::commands::vault::vault_list_trash,
            $crate::commands::vault::vault_restore,
            $crate::commands::vault::vault_purge,
            $crate::commands::vault::vault_search,
            $crate::commands::vault::vault_resolve_link,
            $crate::commands::vault::vault_tasks,
            $crate::commands::vault::vault_edit_task,
            $crate::commands::vault::vault_pin_note,
            $crate::commands::vault::vault_pin_tasks,
            $crate::commands::vault::vault_sticky_view,
            $crate::commands::vault::vault_pinned,
            $crate::commands::vault::vault_capture,
            $crate::commands::vault::vault_sticky_note,
            $crate::commands::vault::vault_import_status,
            $crate::commands::vault::vault_import,
            $crate::commands::vault::choose_vault_folder,
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
    start_vault(handle);
    perform(handle, parse_args(std::env::args()));
    #[cfg(debug_assertions)]
    commands::spike::start_probe_if_requested(handle);
    Ok(())
}

/// Piw's data directory: `PIW_DATA_DIR`, or the OS app-data directory (never next to the binary).
fn data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    match std::env::var_os("PIW_DATA_DIR") {
        Some(dir) => Ok(std::path::PathBuf::from(dir)),
        None => app
            .path()
            .app_data_dir()
            .map_err(|e| format!("no app data directory: {e}")),
    }
}

/// Opens the database in the data directory. Failures are kept and shown by the workspace
/// instead of crashing; the data is never modified then.
fn open_database(app: &AppHandle) -> Result<Arc<Database>, String> {
    let path = data_dir(app)?.join(DATABASE_FILE);
    let db = Database::open(&path).map_err(|e| e.to_string())?;
    log::info!("database ready (schema v{})", storage::SCHEMA_VERSION);
    Ok(Arc::new(db))
}

/// The vault (docs/redesign.md): `PIW_VAULT`, else the folder chosen in Settings, else
/// `~/Piw`. It opens, imports Piw 0.1's data on first use and starts watching in the background.
fn start_vault(app: &AppHandle) {
    use vault::{VaultPhase, VaultSlot};
    let settings = commands::support::database(app)
        .ok()
        .and_then(|db| db.read(services::settings::get).ok())
        .unwrap_or_default();
    // With `PIW_DATA_DIR` (testing, the demo), the default vault lives in that directory too, so
    // a test run never writes into the real `~/Piw`.
    let root = std::env::var_os("PIW_VAULT")
        .map(std::path::PathBuf::from)
        .or_else(|| settings.vault_path.map(std::path::PathBuf::from))
        .or_else(|| {
            std::env::var_os("PIW_DATA_DIR").map(|dir| std::path::PathBuf::from(dir).join("vault"))
        })
        .or_else(|| app.path().home_dir().ok().map(|home| home.join("Piw")));
    let Some(root) = root else {
        app.manage(VaultSlot::new(VaultPhase::Failed {
            root: std::path::PathBuf::new(),
            reason: "no home folder to keep the vault in".into(),
        }));
        return;
    };
    app.manage(VaultSlot::new(VaultPhase::Starting { root: root.clone() }));
    commands::vault::launch(app, root);
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
