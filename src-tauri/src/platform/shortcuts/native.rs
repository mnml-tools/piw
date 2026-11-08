//! Global shortcuts through `tauri-plugin-global-shortcut`.

use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Debug)]
pub enum RegisterError {
    /// Another application already owns the combination.
    InUse,
    /// The accelerator could not be parsed.
    Invalid,
    Other(String),
}

pub fn plugin<R: Runtime>(on_trigger: fn(&AppHandle<R>)) -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                on_trigger(app);
            }
        })
        .build()
}

pub fn register<R: Runtime>(app: &AppHandle<R>, accelerator: &str) -> Result<(), RegisterError> {
    let shortcut: Shortcut = accelerator.parse().map_err(|_| RegisterError::Invalid)?;
    app.global_shortcut()
        .register(shortcut)
        .map_err(|error| classify(&error.to_string()))
}

pub fn unregister_all<R: Runtime>(app: &AppHandle<R>) {
    if let Err(error) = app.global_shortcut().unregister_all() {
        log::warn!("could not unregister global shortcuts: {error}");
    }
}

/// The plugin reports every failure as a string; map the ones the UI can act on.
fn classify(message: &str) -> RegisterError {
    let lower = message.to_ascii_lowercase();
    if lower.contains("already registered") || lower.contains("unable to register") {
        RegisterError::InUse
    } else if lower.contains("parse") || lower.contains("couldn't recognize") {
        RegisterError::Invalid
    } else {
        RegisterError::Other(message.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_plugin_errors() {
        assert!(matches!(
            classify("HotKey already registered: HotKey { .. }"),
            RegisterError::InUse
        ));
        assert!(matches!(
            classify("Unable to register hotkey: BadAccess"),
            RegisterError::InUse
        ));
        assert!(matches!(
            classify("Couldn't recognize \"Foo\" as a valid HotKey Code"),
            RegisterError::Invalid
        ));
        assert!(matches!(classify("boom"), RegisterError::Other(_)));
    }
}
