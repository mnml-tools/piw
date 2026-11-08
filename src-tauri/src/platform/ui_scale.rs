//! Window scale for X11 clients in a scaled Wayland session.
//!
//! When KWin lets X11 apps "apply scaling themselves", XWayland reports every monitor with a
//! scale of 1.0 and publishes the real scale only as `Xft.dpi` (e.g. 134 for 140 %).
//! WebKitGTK reads that DPI and scales CSS pixels by `dpi / 96` itself (verified with WebKitGTK
//! 2.52: `scripts/e2e/scale-probe.sh`), rasterising at the physical resolution. Tauri, however,
//! sizes windows in X11 pixels, so Piw multiplies window sizes by the same factor to keep a
//! 1120×740 CSS-pixel workspace. The webview itself is never zoomed automatically: doing so
//! applied the scale twice (1.96× at 140 %). `PIW_WEBVIEW_ZOOM` remains as a manual override for
//! a WebKitGTK that does not scale by DPI.

use std::sync::atomic::{AtomicU64, Ordering};

pub const ENV_UI_SCALE: &str = "PIW_UI_SCALE";
pub const ENV_WEBVIEW_ZOOM: &str = "PIW_WEBVIEW_ZOOM";

/// An explicit webview zoom (`PIW_WEBVIEW_ZOOM=1.25`), or `None` to leave scaling to the webview.
pub fn webview_zoom_override() -> Option<f64> {
    std::env::var(ENV_WEBVIEW_ZOOM)
        .ok()
        .as_deref()
        .and_then(parse_override)
}

/// Managed state holding the window size factor (CSS pixels to window pixels).
pub struct UiScale(AtomicU64);

impl Default for UiScale {
    fn default() -> Self {
        Self(AtomicU64::new(1.0f64.to_bits()))
    }
}

impl UiScale {
    pub fn get(&self) -> f64 {
        f64::from_bits(self.0.load(Ordering::Relaxed))
    }

    pub fn set(&self, value: f64) {
        self.0.store(value.to_bits(), Ordering::Relaxed);
    }
}

/// Converts GTK's `gtk-xft-dpi` (DPI × 1024, or -1 when unset) to a zoom factor.
pub fn factor_from_xft_dpi(xft_dpi: i32) -> f64 {
    if xft_dpi <= 0 {
        return 1.0;
    }
    let factor = f64::from(xft_dpi) / 1024.0 / 96.0;
    // Round to 2 decimals so 134 DPI gives 1.4 rather than 1.3958…
    let rounded = (factor * 100.0).round() / 100.0;
    if (0.75..=4.0).contains(&rounded) {
        rounded
    } else {
        1.0
    }
}

/// Parses an explicit override such as `PIW_UI_SCALE=1.25`.
pub fn parse_override(value: &str) -> Option<f64> {
    value
        .trim()
        .parse::<f64>()
        .ok()
        .filter(|v| (0.5..=4.0).contains(v))
}

/// Detects the factor. Must be called on the main thread after GTK is initialised.
pub fn detect() -> f64 {
    if let Some(value) = std::env::var(ENV_UI_SCALE)
        .ok()
        .as_deref()
        .and_then(parse_override)
    {
        return value;
    }
    #[cfg(target_os = "linux")]
    if super::env::environment_info().display_server == super::env::DisplayServer::XWayland {
        use gtk::prelude::GtkSettingsExt;
        if let Some(settings) = gtk::Settings::default() {
            return factor_from_xft_dpi(settings.gtk_xft_dpi());
        }
    }
    1.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_xft_dpi_to_zoom() {
        assert_eq!(factor_from_xft_dpi(134 * 1024), 1.4);
        assert_eq!(factor_from_xft_dpi(96 * 1024), 1.0);
        assert_eq!(factor_from_xft_dpi(192 * 1024), 2.0);
    }

    #[test]
    fn ignores_unset_or_absurd_values() {
        assert_eq!(factor_from_xft_dpi(-1), 1.0);
        assert_eq!(factor_from_xft_dpi(0), 1.0);
        assert_eq!(factor_from_xft_dpi(10_000 * 1024), 1.0);
    }

    #[test]
    fn parses_overrides() {
        assert_eq!(parse_override("1.25"), Some(1.25));
        assert_eq!(parse_override("abc"), None);
        assert_eq!(parse_override("9"), None);
    }
}
