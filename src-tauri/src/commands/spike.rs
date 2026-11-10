//! Phase 1 spike helpers (debug builds only): a multi-window ping and an automated platform
//! probe. The probe runs when `PIW_SPIKE_PROBE=<report.json>` is set and records what the
//! desktop actually did, so platform claims are backed by evidence (docs/architecture.md#validation).

use std::collections::BTreeMap;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread::sleep;
use std::time::Duration;

use serde::Serialize;
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, Runtime};

use crate::platform::env::environment_info;
use crate::platform::labels::{CAPTURE, StickyKind, StickyTarget};
use crate::platform::shortcuts::ShortcutManager;
use crate::platform::window::{self, CaptureMode, StickyPlacement};

static PINGS: AtomicU64 = AtomicU64::new(0);
static ACKS: Mutex<Vec<(String, u64)>> = Mutex::new(Vec::new());

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Ping {
    sequence: u64,
    origin: String,
}

/// Broadcasts an event to every window to verify multi-window delivery.
#[tauri::command]
pub async fn spike_broadcast(app: AppHandle, origin: String) -> Result<u64, String> {
    broadcast(&app, origin)
}

/// Windows acknowledge pings so the probe can verify delivery without a human.
#[tauri::command]
pub async fn spike_ack(window: tauri::Window, sequence: u64) -> Result<(), String> {
    if let Ok(mut acks) = ACKS.lock() {
        acks.push((window.label().to_owned(), sequence));
    }
    Ok(())
}

fn broadcast<R: Runtime>(app: &AppHandle<R>, origin: String) -> Result<u64, String> {
    let sequence = PINGS.fetch_add(1, Ordering::SeqCst) + 1;
    app.emit("spike://ping", Ping { sequence, origin })
        .map_err(|e| e.to_string())?;
    Ok(sequence)
}

pub fn start_probe_if_requested<R: Runtime>(app: &AppHandle<R>) {
    let Some(path) = std::env::var_os("PIW_SPIKE_PROBE") else {
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        let report = probe(&app);
        let text = serde_json::to_string_pretty(&report).unwrap_or_default();
        if let Err(error) = std::fs::write(&path, text) {
            log::error!("could not write probe report: {error}");
        }
        log::info!("platform probe finished");
        if std::env::var_os("PIW_SPIKE_PROBE_EXIT").is_some() {
            app.state::<crate::platform::lifecycle::Lifecycle>()
                .request_quit();
            app.exit(0);
        }
    });
}

fn geometry<R: Runtime>(window: &tauri::WebviewWindow<R>) -> Value {
    json!({
        "outerPosition": window.outer_position().map(|p| [p.x, p.y]).ok(),
        "innerSize": window.inner_size().map(|s| [s.width, s.height]).ok(),
        "outerSize": window.outer_size().map(|s| [s.width, s.height]).ok(),
        "scaleFactor": window.scale_factor().ok(),
        "visible": window.is_visible().ok(),
        "focused": window.is_focused().ok(),
        "alwaysOnTop": window.is_always_on_top().ok(),
        "monitor": window.current_monitor().ok().flatten().and_then(|m| m.name().cloned()),
    })
}

fn probe<R: Runtime>(app: &AppHandle<R>) -> Value {
    let pause = |ms| sleep(Duration::from_millis(ms));
    let mut steps: BTreeMap<String, Value> = BTreeMap::new();
    pause(2500);

    let monitors: Vec<Value> = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| {
            json!({
                "name": m.name(),
                "position": [m.position().x, m.position().y],
                "size": [m.size().width, m.size().height],
                "workArea": [m.work_area().position.x, m.work_area().position.y,
                             m.work_area().size.width, m.work_area().size.height],
                "scale": m.scale_factor(),
            })
        })
        .collect();
    steps.insert("00_environment".into(), json!(environment_info()));
    steps.insert("01_monitors".into(), json!(monitors));
    steps.insert("02_memory_baseline".into(), memory());

    // Two stickies at requested positions: one on each monitor when available.
    let a = StickyTarget {
        kind: StickyKind::VaultNote,
        id: "probe-a".into(),
    };
    let b = StickyTarget {
        kind: StickyKind::VaultTasks,
        id: "probe-b".into(),
    };
    let second = app
        .available_monitors()
        .ok()
        .and_then(|m| m.get(1).map(|m| *m.work_area()));
    let requested_a = (240, 240);
    let requested_b = second.map_or((900, 300), |area| {
        (area.position.x + 60, area.position.y + 60)
    });
    let open = |target: &StickyTarget, (x, y): (i32, i32)| {
        window::open_sticky(
            app,
            target,
            StickyPlacement {
                x: Some(x),
                y: Some(y),
                ..Default::default()
            },
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    };
    steps.insert(
        "10_open_a".into(),
        json!({ "requested": requested_a, "result": format!("{:?}", open(&a, requested_a)) }),
    );
    steps.insert(
        "11_open_b".into(),
        json!({ "requested": requested_b, "result": format!("{:?}", open(&b, requested_b)) }),
    );
    pause(2500);
    for (key, target) in [("12_geometry_a", &a), ("13_geometry_b", &b)] {
        if let Ok(w) = window::sticky_window(app, target) {
            steps.insert(key.into(), geometry(&w));
        }
    }

    // Reopening must focus the existing window, never duplicate it.
    let _ = open(&a, requested_a);
    pause(300);
    let count = app
        .webview_windows()
        .keys()
        .filter(|l| l.contains("probe-a"))
        .count();
    steps.insert(
        "14_reopen_is_single_instance".into(),
        json!({ "windowsForTarget": count }),
    );

    // Explicit move after creation (what "drag + restore" relies on).
    if let Ok(w) = window::sticky_window(app, &a) {
        let moved = w
            .set_position(PhysicalPosition::new(400, 360))
            .map_err(|e| e.to_string());
        pause(800);
        steps.insert(
            "15_move_a_to_400_360".into(),
            json!({ "result": format!("{moved:?}"), "after": geometry(&w) }),
        );
        let top =
            crate::platform::stickies::set_always_on_top(app, &a, true).map_err(|e| e.to_string());
        pause(2500);
        steps.insert(
            "16_always_on_top_a".into(),
            json!({ "result": format!("{top:?}"), "after": geometry(&w) }),
        );
        // Tray "Show/Hide Sticky Notes": state must survive the hide/show cycle.
        let hidden = crate::platform::stickies::toggle_all(app).map_err(|e| e.to_string());
        pause(800);
        let hidden_state = geometry(&w);
        let shown = crate::platform::stickies::toggle_all(app).map_err(|e| e.to_string());
        pause(2500);
        steps.insert("17_hide_show_all".into(), json!({
            "hide": format!("{hidden:?}"), "whileHidden": hidden_state,
            "show": format!("{shown:?}"), "afterShow": geometry(&w),
            "registry": app.state::<crate::platform::stickies::StickyRegistry>().placement(&a.label()),
        }));
    }

    // Off-screen restore is clamped by `visible_rect`.
    let off = window::visible_rect(
        app,
        crate::platform::geometry::Rect::new(-40_000, -40_000, 300, 260),
    );
    steps.insert("18_offscreen_clamp".into(), json!(off));

    // Multi-window events: every window acknowledges the ping.
    if let Ok(mut acks) = ACKS.lock() {
        acks.clear();
    }
    let sequence = broadcast(app, "probe".into());
    pause(1500);
    let acks: Vec<(String, u64)> = ACKS.lock().map(|a| a.clone()).unwrap_or_default();
    steps.insert(
        "20_broadcast".into(),
        json!({ "sequence": sequence, "acks": acks }),
    );

    // Capture popup: visibility and focus after show, then hide.
    let shown = window::show_capture(app, CaptureMode::Task).map_err(|e| e.to_string());
    pause(900);
    if let Some(w) = app.get_webview_window(CAPTURE) {
        steps.insert(
            "30_capture_show".into(),
            json!({ "result": format!("{shown:?}"), "after": geometry(&w) }),
        );
        let hidden = window::hide_capture(app).map_err(|e| e.to_string());
        pause(500);
        steps.insert(
            "31_capture_hide".into(),
            json!({ "result": format!("{hidden:?}"), "after": geometry(&w) }),
        );
    }

    steps.insert("40_memory_2_stickies".into(), memory());
    let extra: Vec<StickyTarget> = (0..3)
        .map(|i| StickyTarget {
            kind: StickyKind::VaultNote,
            id: format!("probe-extra-{i}"),
        })
        .collect();
    for (i, target) in extra.iter().enumerate() {
        let offset = i32::try_from(i).unwrap_or(0) * 40;
        let _ = open(target, (300 + offset, 600 + offset));
    }
    pause(3000);
    steps.insert("41_memory_5_stickies".into(), memory());
    for target in extra.iter().chain([&a, &b]) {
        let _ = window::close_sticky(app, target);
    }
    pause(1500);
    steps.insert("42_memory_after_close".into(), memory());

    // Lifecycle: closing the workspace hides it (tray mode); closing capture keeps it ready.
    if let Some(main) = app.get_webview_window(crate::platform::labels::MAIN) {
        let closed = main.close().map_err(|e| e.to_string());
        pause(800);
        let alive = app
            .get_webview_window(crate::platform::labels::MAIN)
            .is_some();
        steps.insert("60_close_main".into(), json!({
            "result": format!("{closed:?}"), "windowStillExists": alive, "after": geometry(&main),
        }));
        let reopened = window::show_main(app).map_err(|e| e.to_string());
        pause(800);
        steps.insert(
            "61_reopen_main".into(),
            json!({ "result": format!("{reopened:?}"), "after": geometry(&main) }),
        );
    }
    if let Some(capture) = app.get_webview_window(CAPTURE) {
        let _ = window::show_capture(app, CaptureMode::Note);
        pause(500);
        let closed = capture.close().map_err(|e| e.to_string());
        pause(800);
        steps.insert(
            "62_close_capture".into(),
            json!({
                "result": format!("{closed:?}"),
                "windowStillExists": app.get_webview_window(CAPTURE).is_some(),
                "after": geometry(&capture),
            }),
        );
    }

    pause(1000);
    steps.insert(
        "50_shortcut_status".into(),
        json!(app.state::<ShortcutManager>().status()),
    );
    json!(steps)
}

/// Proportional set size of Piw and its WebKit helper processes, in KiB (Linux only).
fn memory() -> Value {
    #[cfg(target_os = "linux")]
    {
        let root = std::process::id();
        let mut parents: BTreeMap<u32, u32> = BTreeMap::new();
        let mut names: BTreeMap<u32, String> = BTreeMap::new();
        if let Ok(entries) = std::fs::read_dir("/proc") {
            for entry in entries.flatten() {
                let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else {
                    continue;
                };
                let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
                    continue;
                };
                let Some(close) = stat.rfind(')') else {
                    continue;
                };
                let name = stat[stat.find('(').map_or(0, |i| i + 1)..close].to_owned();
                let ppid = stat[close + 2..]
                    .split(' ')
                    .nth(1)
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(0);
                parents.insert(pid, ppid);
                names.insert(pid, name);
            }
        }
        let is_descendant = |mut pid: u32| {
            while pid > 1 {
                if pid == root {
                    return true;
                }
                pid = parents.get(&pid).copied().unwrap_or(0);
            }
            false
        };
        let mut total = 0u64;
        let mut processes = Vec::new();
        for (&pid, name) in &names {
            if !is_descendant(pid) {
                continue;
            }
            let pss = std::fs::read_to_string(format!("/proc/{pid}/smaps_rollup"))
                .ok()
                .and_then(|s| {
                    s.lines()
                        .find(|l| l.starts_with("Pss:"))
                        .and_then(|l| l.split_whitespace().nth(1)?.parse::<u64>().ok())
                })
                .unwrap_or(0);
            total += pss;
            processes.push(json!({ "pid": pid, "name": name, "pssKiB": pss }));
        }
        json!({ "totalPssKiB": total, "processes": processes })
    }
    #[cfg(not(target_os = "linux"))]
    {
        Value::Null
    }
}
