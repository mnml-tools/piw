//! Process environment and display-server detection.
//!
//! On Linux Wayland sessions, GTK windows cannot position themselves or stay on top, which
//! breaks sticky notes. Piw therefore runs through XWayland by default on Wayland and lets
//! users opt into native Wayland with `PIW_WAYLAND_NATIVE=1`. See docs/architecture.md#linux-window-backend.

use serde::Serialize;
use ts_rs::TS;

/// Display server in use by the app's windows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum DisplayServer {
    /// Windows, macOS, or anything we do not need to distinguish.
    Native,
    X11,
    /// An X11 client inside a Wayland session.
    XWayland,
    Wayland,
}

#[derive(Debug, Clone, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct EnvironmentInfo {
    pub os: String,
    pub display_server: DisplayServer,
    /// True when the desktop session is Wayland, regardless of how Piw renders.
    pub wayland_session: bool,
    pub desktop: Option<String>,
}

#[cfg(any(target_os = "linux", test))]
pub const ENV_WAYLAND_NATIVE: &str = "PIW_WAYLAND_NATIVE";

/// Decides whether GTK should be forced onto the X11 backend.
///
/// Pure so that the policy can be unit tested; `lookup` reads an environment variable.
#[cfg(any(target_os = "linux", test))]
pub fn should_force_x11(lookup: impl Fn(&str) -> Option<String>) -> bool {
    let wayland_session = lookup("XDG_SESSION_TYPE").is_some_and(|v| v == "wayland")
        || lookup("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty());
    let has_xwayland = lookup("DISPLAY").is_some_and(|v| !v.is_empty());
    let user_chose_backend = lookup("GDK_BACKEND").is_some_and(|v| !v.is_empty());
    let wants_native = lookup(ENV_WAYLAND_NATIVE).is_some_and(|v| v == "1" || v == "true");
    wayland_session && has_xwayland && !user_chose_backend && !wants_native
}

/// Applies process-wide environment tweaks. Must run before any window or thread is created.
pub fn configure_process() {
    #[cfg(target_os = "linux")]
    if should_force_x11(|key| std::env::var(key).ok()) {
        // SAFETY: called at the very start of `run`, before Tauri, GTK or any other thread
        // starts, so no other code can be reading the environment concurrently.
        #[allow(unsafe_code)]
        unsafe {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }
}

pub fn environment_info() -> EnvironmentInfo {
    let var = |key: &str| std::env::var(key).ok().filter(|v| !v.is_empty());
    let wayland_session =
        var("XDG_SESSION_TYPE").is_some_and(|v| v == "wayland") || var("WAYLAND_DISPLAY").is_some();
    let display_server = if cfg!(target_os = "linux") {
        match (wayland_session, var("GDK_BACKEND").as_deref()) {
            (true, Some("x11")) => DisplayServer::XWayland,
            (true, _) => DisplayServer::Wayland,
            (false, _) => DisplayServer::X11,
        }
    } else {
        DisplayServer::Native
    };
    EnvironmentInfo {
        os: std::env::consts::OS.to_owned(),
        display_server,
        wayland_session,
        desktop: var("XDG_CURRENT_DESKTOP"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn env(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        move |key| map.get(key).cloned()
    }

    #[test]
    fn forces_x11_on_wayland_with_xwayland() {
        assert!(should_force_x11(env(&[
            ("XDG_SESSION_TYPE", "wayland"),
            ("DISPLAY", ":1")
        ])));
    }

    #[test]
    fn respects_explicit_choices() {
        let base = [("XDG_SESSION_TYPE", "wayland"), ("DISPLAY", ":1")];
        let mut native = base.to_vec();
        native.push((ENV_WAYLAND_NATIVE, "1"));
        assert!(!should_force_x11(env(&native)));
        let mut gdk = base.to_vec();
        gdk.push(("GDK_BACKEND", "wayland"));
        assert!(!should_force_x11(env(&gdk)));
    }

    #[test]
    fn leaves_x11_and_xwayland_less_sessions_alone() {
        assert!(!should_force_x11(env(&[
            ("XDG_SESSION_TYPE", "x11"),
            ("DISPLAY", ":0")
        ])));
        assert!(!should_force_x11(env(&[("XDG_SESSION_TYPE", "wayland")])));
    }
}
