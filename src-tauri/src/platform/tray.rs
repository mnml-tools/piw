//! System tray / menu bar icon. Every action lives in the menu because Linux tray hosts
//! (AppIndicator / StatusNotifierItem) do not deliver plain clicks to the app.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use super::window::{CaptureMode, show_capture, show_main};

pub const EVENT_NAVIGATE: &str = "piw://navigate";

const QUICK_NOTE: &str = "tray.quick_note";
const QUICK_TASK: &str = "tray.quick_task";
const OPEN_WORKSPACE: &str = "tray.open_workspace";
const TOGGLE_STICKIES: &str = "tray.toggle_stickies";
const SETTINGS: &str = "tray.settings";
const QUIT: &str = "tray.quit";

pub fn create<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let menu = Menu::with_items(
        app,
        &[
            &MenuItem::with_id(app, QUICK_NOTE, "Quick Note", true, None::<&str>)?,
            &MenuItem::with_id(app, QUICK_TASK, "Quick Task", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, OPEN_WORKSPACE, "Open Workspace", true, None::<&str>)?,
            &MenuItem::with_id(
                app,
                TOGGLE_STICKIES,
                "Show/Hide Sticky Notes",
                true,
                None::<&str>,
            )?,
            &MenuItem::with_id(app, SETTINGS, "Settings…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, QUIT, "Quit Piw", true, None::<&str>)?,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id("piw")
        .tooltip("Piw")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()));
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn handle_menu<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let result = match id {
        QUICK_NOTE => show_capture(app, CaptureMode::Note),
        QUICK_TASK => show_capture(app, CaptureMode::Task),
        OPEN_WORKSPACE => show_main(app),
        TOGGLE_STICKIES => super::stickies::toggle_all(app),
        SETTINGS => show_main(app).and_then(|()| {
            app.emit_to(super::labels::MAIN, EVENT_NAVIGATE, "settings")
                .map_err(Into::into)
        }),
        QUIT => {
            app.state::<super::lifecycle::Lifecycle>().request_quit();
            app.exit(0);
            Ok(())
        }
        _ => Ok(()),
    };
    if let Err(error) = result {
        log::error!("tray action {id} failed: {error}");
    }
}
