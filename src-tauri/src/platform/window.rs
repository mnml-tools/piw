//! Creation and visibility of the app's windows: workspace, quick capture and stickies.

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use ts_rs::TS;

use super::geometry::{Rect, ensure_visible};
use super::labels::{CAPTURE, MAIN, StickyTarget};
use super::stickies::{StickyRegistry, settle};
use super::ui_scale::UiScale;
use crate::error::{AppError, AppResult};

const CAPTURE_WIDTH: f64 = 520.0;
const CAPTURE_HEIGHT: f64 = 200.0;
pub const STICKY_DEFAULT_WIDTH: f64 = 300.0;
pub const STICKY_DEFAULT_HEIGHT: f64 = 260.0;
const STICKY_MIN_WIDTH: f64 = 200.0;
const STICKY_MIN_HEIGHT: f64 = 120.0;

pub const EVENT_CAPTURE_OPEN: &str = "piw://capture/open";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum CaptureMode {
    Note,
    Task,
}

#[derive(Debug, Clone, Copy, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct CaptureOpenPayload {
    pub mode: CaptureMode,
}

fn app_url() -> WebviewUrl {
    WebviewUrl::App("index.html".into())
}

/// A webview builder locked to Piw's own pages (see [`super::navigation`]).
fn builder<'a, R: Runtime>(
    app: &'a AppHandle<R>,
    label: &str,
) -> WebviewWindowBuilder<'a, R, AppHandle<R>> {
    let dev_server = if cfg!(debug_assertions) {
        app.config().build.dev_url.clone()
    } else {
        None
    };
    WebviewWindowBuilder::new(app, label, app_url())
        .on_navigation(move |url| {
            let allowed = super::navigation::is_app_url(url, dev_server.as_ref());
            if !allowed {
                log::warn!("blocked navigation away from the app");
            }
            allowed
        })
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
}

/// Factor between CSS pixels and window pixels, used to size windows (see [`super::ui_scale`]).
pub fn ui_scale<R: Runtime>(app: &AppHandle<R>) -> f64 {
    app.try_state::<UiScale>().map_or(1.0, |s| s.get())
}

/// Zooms the webview only when explicitly asked (`PIW_WEBVIEW_ZOOM`). WebKitGTK already scales
/// CSS pixels by `Xft.dpi`, so an automatic zoom would apply the scale twice.
fn apply_zoom<R: Runtime>(window: &WebviewWindow<R>) {
    if let Some(zoom) = super::ui_scale::webview_zoom_override()
        && let Err(error) = window.set_zoom(zoom)
    {
        log::warn!("could not set webview zoom: {error}");
    }
}

/// Returns the workspace window, creating it (hidden) if needed.
pub fn ensure_main<R: Runtime>(app: &AppHandle<R>) -> AppResult<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(MAIN) {
        return Ok(window);
    }
    let scale = ui_scale(app);
    let builder = builder(app, MAIN)
        .title("Piw")
        .inner_size(1120.0 * scale, 740.0 * scale)
        .min_inner_size(420.0 * scale, 360.0 * scale)
        .visible(false)
        .center();
    // The app's top bar is the title bar (docs/ui-design-system.md, "Top bar"). macOS keeps its
    // native traffic lights and resizing, overlaid on the bar; Linux and Windows draw their own
    // window controls and resize edges in the webview.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(16.0, 22.0));
    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false);
    let window = builder.build()?;
    apply_zoom(&window);
    Ok(window)
}

pub fn show_main<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    let window = ensure_main(app)?;
    set_dock_visible(app, true);
    window.show()?;
    window.unminimize()?;
    window.set_focus()?;
    Ok(())
}

pub fn hide_main<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(MAIN) {
        window.hide()?;
    }
    set_dock_visible(app, false);
    Ok(())
}

/// Creates the hidden quick-capture window up front so that the shortcut opens it instantly.
pub fn ensure_capture<R: Runtime>(app: &AppHandle<R>) -> AppResult<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(CAPTURE) {
        return Ok(window);
    }
    let scale = ui_scale(app);
    let window = builder(app, CAPTURE)
        .title("Piw — Quick Capture")
        .inner_size(CAPTURE_WIDTH * scale, CAPTURE_HEIGHT * scale)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .center()
        .build()?;
    apply_zoom(&window);
    Ok(window)
}

/// Shows the capture popup on the monitor under the mouse pointer and focuses it.
pub fn show_capture<R: Runtime>(app: &AppHandle<R>, mode: CaptureMode) -> AppResult<()> {
    let window = ensure_capture(app)?;
    if let Some(position) = capture_position(app, &window) {
        // Ignored by native Wayland compositors, which place the window themselves.
        window.set_position(position)?;
    }
    window.show()?;
    window.set_focus()?;
    window.emit_to(CAPTURE, EVENT_CAPTURE_OPEN, CaptureOpenPayload { mode })?;
    Ok(())
}

/// Hides the capture popup. When the workspace is not visible, the whole app is hidden on
/// macOS so that focus returns to the previously active application.
pub fn hide_capture<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(CAPTURE) {
        window.hide()?;
    }
    #[cfg(target_os = "macos")]
    {
        let main_visible = app
            .get_webview_window(MAIN)
            .and_then(|w| w.is_visible().ok())
            .unwrap_or(false);
        if !main_visible {
            app.hide()?;
        }
    }
    Ok(())
}

fn capture_position<R: Runtime>(
    app: &AppHandle<R>,
    window: &WebviewWindow<R>,
) -> Option<PhysicalPosition<i32>> {
    let cursor = app.cursor_position().ok()?;
    let monitor = app
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let size = window.outer_size().ok()?;
    let area = monitor.work_area();
    let x = area.position.x + (i64::from(area.size.width) - i64::from(size.width)) as i32 / 2;
    // Slightly above centre, where command palettes usually appear.
    let y = area.position.y + (i64::from(area.size.height) - i64::from(size.height)) as i32 / 3;
    Some(PhysicalPosition::new(x, y))
}

/// Saved placement of a sticky window: outer position in physical pixels and inner size in
/// logical pixels (so the sticky keeps its visual size across monitors with different scales).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "bindings/")]
pub struct StickyPlacement {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: f64,
    pub height: f64,
    pub always_on_top: bool,
}

impl Default for StickyPlacement {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            width: STICKY_DEFAULT_WIDTH,
            height: STICKY_DEFAULT_HEIGHT,
            always_on_top: false,
        }
    }
}

/// Opens (or focuses, if already open) the sticky window for `target`.
pub fn open_sticky<R: Runtime>(
    app: &AppHandle<R>,
    target: &StickyTarget,
    placement: StickyPlacement,
) -> AppResult<WebviewWindow<R>> {
    let label = target.label();
    let registry = app.state::<StickyRegistry>();
    if let Some(window) = app.get_webview_window(&label) {
        window.show()?;
        window.set_focus()?;
        if let Some(current) = registry.placement(&label) {
            settle(&window, current);
        }
        return Ok(window);
    }
    let width = placement.width.max(STICKY_MIN_WIDTH);
    let height = placement.height.max(STICKY_MIN_HEIGHT);
    let zoom = ui_scale(app);

    // Restore onto a monitor that is connected now (CA-07). The size is an estimate in
    // physical pixels; it only matters for the visibility check.
    let mut placement = StickyPlacement {
        width,
        height,
        ..placement
    };
    let mut logical_position = None;
    if let (Some(x), Some(y)) = (placement.x, placement.y) {
        let scale = app
            .monitor_from_point(f64::from(x), f64::from(y))
            .ok()
            .flatten()
            .map_or(1.0, |m| m.scale_factor());
        let estimate = Rect::new(
            x,
            y,
            (width * zoom * scale) as u32,
            (height * zoom * scale) as u32,
        );
        match visible_rect(app, estimate) {
            Some(rect) => {
                placement.x = Some(rect.x);
                placement.y = Some(rect.y);
                logical_position = Some((f64::from(rect.x) / scale, f64::from(rect.y) / scale));
            }
            None => {
                placement.x = None;
                placement.y = None;
            }
        }
    }

    let mut builder = builder(app, &label)
        .title("Piw sticky")
        .inner_size(width * zoom, height * zoom)
        .min_inner_size(STICKY_MIN_WIDTH * zoom, STICKY_MIN_HEIGHT * zoom)
        .decorations(false)
        .always_on_top(placement.always_on_top)
        .skip_taskbar(true)
        .maximizable(false)
        .minimizable(false)
        .visible(false);
    // Window managers honour a position given before the window is mapped (a "user
    // specified" position); positions set after mapping races with their own placement.
    if let Some((x, y)) = logical_position {
        builder = builder.position(x, y);
    }
    let window = builder.build()?;
    apply_zoom(&window);

    registry.remember(&label, placement);
    if !registry.group_hidden() {
        window.show()?;
        settle(&window, placement);
    }
    Ok(window)
}

/// Clamps `wanted` to the monitors that are connected right now.
pub fn visible_rect<R: Runtime>(app: &AppHandle<R>, wanted: Rect) -> Option<Rect> {
    let monitors = app.available_monitors().ok()?;
    let primary = app.primary_monitor().ok().flatten();
    let areas: Vec<Rect> = monitors
        .iter()
        .map(|m| {
            let a = m.work_area();
            Rect::new(a.position.x, a.position.y, a.size.width, a.size.height)
        })
        .collect();
    let fallback = primary
        .and_then(|p| monitors.iter().position(|m| m.position() == p.position()))
        .unwrap_or(0);
    ensure_visible(wanted, &areas, fallback)
}

/// Destroys a sticky window. `destroy` (not `close`) skips `CloseRequested`, which is reserved
/// for the user closing the window from the window manager (= "Hide from desktop").
pub fn close_sticky<R: Runtime>(app: &AppHandle<R>, target: &StickyTarget) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(&target.label()) {
        window.destroy()?;
    }
    Ok(())
}

pub fn sticky_window<R: Runtime>(
    app: &AppHandle<R>,
    target: &StickyTarget,
) -> AppResult<WebviewWindow<R>> {
    app.get_webview_window(&target.label())
        .ok_or(AppError::NotFound {
            entity: "sticky window",
        })
}

/// On macOS the Dock icon is only shown while the workspace is visible, so capture and
/// stickies behave like a menu-bar utility. A no-op elsewhere.
#[allow(unused_variables)]
fn set_dock_visible<R: Runtime>(app: &AppHandle<R>, visible: bool) {
    #[cfg(target_os = "macos")]
    {
        let policy = if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        };
        if let Err(error) = app.set_activation_policy(policy) {
            log::warn!("could not change activation policy: {error}");
        }
    }
}
