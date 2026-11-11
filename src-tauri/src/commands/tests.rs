//! IPC contract tests: real commands, JSON in camelCase as the UI sends it, through Tauri's
//! mock runtime. They catch argument-name and serialisation mismatches the type checker can't.

use std::sync::{Arc, Mutex};

use serde_json::{Value, json};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{
    INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets,
};
use tauri::webview::InvokeRequest;
use tauri::{App, Listener, Manager, WebviewWindow, WebviewWindowBuilder};

use super::support::DataState;
use crate::platform::lifecycle::Lifecycle;
use crate::platform::shortcuts::ShortcutManager;
use crate::storage::Database;
use crate::vault::{VaultPhase, VaultSlot};

struct Harness {
    _app: App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
    events: Arc<Mutex<Vec<Value>>>,
}

fn harness_with(data: Result<Arc<Database>, String>) -> Harness {
    harness_full(
        data,
        VaultSlot::new(VaultPhase::Failed {
            root: "/nowhere".into(),
            reason: "no vault in this test".into(),
        }),
    )
}

fn harness_full(data: Result<Arc<Database>, String>, vault: VaultSlot) -> Harness {
    let app = mock_builder()
        .manage(DataState(data))
        .manage(vault)
        .manage(Lifecycle::default())
        .manage(ShortcutManager::default())
        .manage(crate::platform::stickies::StickyRegistry::default())
        .manage(crate::platform::ui_scale::UiScale::default())
        .invoke_handler(crate::app_commands![])
        .build(mock_context(noop_assets()))
        .expect("mock app");
    let window = WebviewWindowBuilder::new(&app, "main", Default::default())
        .build()
        .expect("mock window");
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    app.listen_any(crate::domain::change::EVENT_CHANGED, move |event| {
        if let Ok(value) = serde_json::from_str(event.payload()) {
            sink.lock().unwrap().push(value);
        }
    });
    Harness {
        _app: app,
        window,
        events,
    }
}

fn harness() -> Harness {
    harness_with(Ok(Arc::new(Database::open_in_memory().unwrap())))
}

impl Harness {
    fn invoke(&self, cmd: &str, args: Value) -> Result<Value, Value> {
        let request = InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: self.window.url().expect("window url"),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        };
        get_ipc_response(&self.window, request).map(|body| body.deserialize::<Value>().unwrap())
    }

    fn ok(&self, cmd: &str, args: Value) -> Value {
        self.invoke(cmd, args)
            .unwrap_or_else(|e| panic!("{cmd} failed: {e}"))
    }
}

#[test]
fn settings_round_trip_and_broadcast_which_window_changed_them() {
    let h = harness();
    h.events.lock().unwrap().clear();
    let settings = h.ok("update_settings", json!({ "patch": { "theme": "dark" } }));
    assert_eq!(settings["theme"], "dark");
    let events = h.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["origin"], "main");
    assert_eq!(h.ok("get_settings", json!({}))["theme"], "dark");
}

#[test]
fn reads_do_not_broadcast() {
    let h = harness();
    h.ok("get_settings", json!({}));
    h.ok("get_capture_draft", json!({}));
    assert!(h.events.lock().unwrap().is_empty());
}

#[test]
fn validation_errors_have_stable_codes() {
    let h = harness();
    let error = h
        .invoke("update_settings", json!({ "patch": { "telemetry": true } }))
        .unwrap_err();
    assert_eq!(error["code"], "validation");
    let error = h
        .invoke(
            "get_sticky",
            json!({ "target": { "kind": "vault_note", "id": "a b" } }),
        )
        .unwrap_err();
    assert_eq!(error["code"], "validation");
}

#[test]
fn a_database_that_failed_to_open_is_reported_not_fatal() {
    let h = harness_with(Err("schema v9 is newer than this Piw".into()));
    let status = h.ok("app_status", json!({}));
    assert_eq!(status["dataError"], "schema v9 is newer than this Piw");
    let error = h.invoke("get_settings", json!({})).unwrap_err();
    assert_eq!(error["code"], "storage");
}

#[test]
fn commands_are_refused_from_remote_origins() {
    let h = harness();
    let request = InvokeRequest {
        cmd: "get_settings".into(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: "https://example.com".parse().unwrap(),
        body: InvokeBody::Json(json!({})),
        headers: Default::default(),
        invoke_key: INVOKE_KEY.to_string(),
    };
    assert!(get_ipc_response(&h.window, request).is_err());
}

#[test]
fn pinning_opens_one_window_per_item_and_hiding_keeps_it_pinned() {
    let (h, _dir) = vault_harness();
    assert_eq!(
        h.ok("vault_pin_note", json!({ "path": "Work/Inbox.md" })),
        1
    );
    // Pinning again focuses the same window instead of creating another.
    assert_eq!(
        h.ok("vault_pin_note", json!({ "path": "Work/Inbox.md" })),
        1
    );
    let pinned = h.ok("vault_pinned", json!({}));
    let target = pinned[0]["target"].clone();
    let label = format!("sticky:vault_note:{}", target["id"].as_str().unwrap());
    assert!(h._app.get_webview_window(&label).is_some());

    h.ok("close_sticky", json!({ "target": target }));
    assert_eq!(
        h.ok("vault_pinned", json!({}))[0]["isOpen"],
        false,
        "hidden, still pinned"
    );
    h.ok(
        "set_sticky_color",
        json!({ "target": target, "color": "mint" }),
    );
    assert_eq!(
        h.ok("get_sticky", json!({ "target": target }))["color"],
        "mint"
    );

    h.ok("unpin_sticky", json!({ "target": target }));
    assert_eq!(h.ok("vault_pinned", json!({})), json!([]));
}

/// A harness whose vault is a copy of `fixtures/vault` (kept alive by the returned directory).
fn vault_harness() -> (Harness, tempfile::TempDir) {
    let dir = tempfile::tempdir().unwrap();
    let fixtures = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../fixtures/vault");
    let root = dir.path().join("vault");
    copy_dir(&fixtures, &root);
    let state = crate::vault::start(&root, &dir.path().join("data"), |_| {}).unwrap();
    let db = Database::open_in_memory().unwrap();
    let h = harness_full(Ok(Arc::new(db)), VaultSlot::new(VaultPhase::Ready(state)));
    (h, dir)
}

fn copy_dir(from: &std::path::Path, to: &std::path::Path) {
    std::fs::create_dir_all(to).unwrap();
    for entry in std::fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_dir(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).unwrap();
        }
    }
}

#[test]
fn vault_commands_are_off_without_a_vault() {
    let h = harness();
    assert_eq!(h.ok("vault_status", json!({}))["phase"], "failed");
    let error = h.invoke("vault_tree", json!({})).unwrap_err();
    assert_eq!(error["code"], "not_found");
}

#[test]
fn vault_notes_round_trip_with_camel_case_arguments() {
    let (h, _dir) = vault_harness();
    let status = h.ok("vault_status", json!({}));
    assert_eq!(status["phase"], "ready");

    let tree = h.ok("vault_tree", json!({}));
    assert_eq!(
        tree[0],
        json!({ "path": "Personal", "kind": "folder", "name": "Personal" })
    );

    let note = h.ok("vault_read_note", json!({ "path": "Work/Inbox.md" }));
    assert_eq!(note["title"], "Inbox");
    assert_eq!(note["space"], "Work");
    h.events.lock().unwrap().clear();
    let saved = h.ok(
        "vault_write_note",
        json!({ "path": "Work/Inbox.md", "text": "- [ ] New\n", "expectedHash": note["hash"] }),
    );
    assert_ne!(saved["hash"], note["hash"]);
    assert_eq!(
        h.events.lock().unwrap().clone(),
        vec![json!({ "changes": [{ "kind": "file", "id": "Work/Inbox.md" }], "origin": "main" })]
    );
    let stale = h
        .invoke(
            "vault_write_note",
            json!({ "path": "Work/Inbox.md", "text": "x", "expectedHash": note["hash"] }),
        )
        .unwrap_err();
    assert_eq!(stale["code"], "conflict");
    let outside = h
        .invoke("vault_read_note", json!({ "path": "../secret.md" }))
        .unwrap_err();
    assert_eq!(outside["code"], "validation");

    let created = h.ok(
        "vault_create_note",
        json!({ "folder": "Work", "title": "Ideas", "text": "" }),
    );
    assert_eq!(created["path"], "Work/Ideas.md");
    assert_eq!(
        h.ok(
            "vault_create_folder",
            json!({ "parent": null, "name": "Archive" })
        ),
        "Archive"
    );

    let renamed = h.ok(
        "vault_rename",
        json!({ "from": "Work/Projects/Refactor 2FA.md", "to": "Work/Projects/TOTP.md" }),
    );
    assert_eq!(renamed["path"], "Work/Projects/TOTP.md");
    assert_eq!(renamed["linked"].as_array().unwrap().len(), 2);
    assert_eq!(
        h.ok("vault_resolve_link", json!({ "target": "totp" })),
        "Work/Projects/TOTP.md"
    );
    assert_eq!(
        h.ok("vault_resolve_link", json!({ "target": "Nowhere" })),
        Value::Null
    );

    let hits = h.ok(
        "vault_search",
        json!({ "query": "verify", "space": "Personal" }),
    );
    assert_eq!(hits, json!([]));
    let hits = h.ok("vault_search", json!({ "query": "verify", "space": null }));
    assert_eq!(hits[0]["path"], "Work/Projects/TOTP.md");

    let trashed = h.ok("vault_trash", json!({ "path": "Work/Ideas.md" }));
    assert_eq!(trashed["kind"], "note");
    let listed = h.ok("vault_list_trash", json!({}));
    assert_eq!(listed[0]["id"], trashed["id"]);
    assert_eq!(
        h.ok("vault_restore", json!({ "id": trashed["id"] })),
        "Work/Ideas.md"
    );
    let again = h.ok("vault_trash", json!({ "path": "Work/Ideas.md" }));
    h.ok("vault_purge", json!({ "id": again["id"] }));
    assert_eq!(h.ok("vault_list_trash", json!({})), json!([]));
}

#[test]
fn vault_task_views_and_edits_round_trip() {
    let (h, _dir) = vault_harness();
    let today = h.ok(
        "vault_tasks",
        json!({ "view": "today", "space": null, "today": "2026-11-10" }),
    );
    let call = today
        .as_array()
        .unwrap()
        .iter()
        .find(|t| t["path"] == "Work/Inbox.md")
        .unwrap()
        .clone();
    assert_eq!(call["noteTitle"], "Inbox");
    assert_eq!(call["due"], "2026-11-10");
    h.events.lock().unwrap().clear();
    let hash = h.ok(
        "vault_edit_task",
        json!({
            "path": call["path"],
            "line": call["line"],
            "lineText": call["lineText"],
            "fileHash": call["fileHash"],
            "change": { "kind": "check", "checked": true, "today": "2026-11-10" },
        }),
    );
    assert!(hash.is_string());
    assert_eq!(
        h.events.lock().unwrap().clone(),
        vec![json!({ "changes": [{ "kind": "file", "id": "Work/Inbox.md" }], "origin": "main" })]
    );
    let note = h.ok("vault_read_note", json!({ "path": "Work/Inbox.md" }));
    assert!(
        note["text"]
            .as_str()
            .unwrap()
            .starts_with("- [x] Call the accountant 📅 2026-11-10 ✅ 2026-11-10\n")
    );
    let bad_date = h
        .invoke(
            "vault_edit_task",
            json!({
                "path": "Work/Inbox.md", "line": 1, "lineText": "x", "fileHash": "x",
                "change": { "kind": "due", "due": "2026-13-01" },
            }),
        )
        .unwrap_err();
    assert_eq!(bad_date["code"], "validation");
}

#[test]
fn vault_stickies_capture_and_reach_only_their_own_note() {
    let (h, _dir) = vault_harness();
    assert_eq!(
        h.ok("vault_pin_note", json!({ "path": "Work/Inbox.md" })),
        1
    );
    assert_eq!(
        h.ok("vault_pin_note", json!({ "path": "Work/Inbox.md" })),
        1
    );
    assert_eq!(
        h.ok(
            "vault_pin_tasks",
            json!({ "view": "today", "space": "Work" })
        ),
        2
    );
    let pinned = h.ok("vault_pinned", json!({}));
    let note = pinned
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["shows"]["kind"] == "note")
        .unwrap()
        .clone();
    assert_eq!(note["shows"]["path"], "Work/Inbox.md");
    assert_eq!(note["target"]["kind"], "vault_note");
    assert_eq!(note["isOpen"], true);

    let label = format!(
        "sticky:vault_note:{}",
        note["target"]["id"].as_str().unwrap()
    );
    let sticky = h
        ._app
        .get_webview_window(&label)
        .expect("the pin opened the sticky window");
    let call = |cmd: &str, args: Value| {
        let request = InvokeRequest {
            cmd: cmd.into(),
            callback: CallbackFn(0),
            error: CallbackFn(1),
            url: sticky.url().unwrap(),
            body: InvokeBody::Json(args),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        };
        get_ipc_response(&sticky, request).map(|b| b.deserialize::<Value>().unwrap())
    };
    let shows = call("vault_sticky_view", json!({ "target": note["target"] })).unwrap();
    assert_eq!(
        shows,
        json!({ "kind": "note", "path": "Work/Inbox.md", "title": "Inbox" })
    );
    assert!(call("vault_read_note", json!({ "path": "Work/Inbox.md" })).is_ok());
    let denied = call("vault_read_note", json!({ "path": "Work/Meetings.md" })).unwrap_err();
    assert_eq!(denied["code"], "validation");
    let denied = call(
        "vault_tasks",
        json!({ "view": "all", "space": null, "today": "2026-11-10" }),
    )
    .unwrap_err();
    assert_eq!(denied["code"], "validation");

    // A rename keeps the sticky on its note.
    h.ok(
        "vault_rename",
        json!({ "from": "Work/Inbox.md", "to": "Work/Capture.md" }),
    );
    let shows = call("vault_sticky_view", json!({ "target": note["target"] })).unwrap();
    assert_eq!(shows["path"], "Work/Capture.md");

    let path = h.ok(
        "vault_capture",
        json!({
            "space": "Personal", "mode": "task", "text": "Buy flowers",
            "description": "", "due": "2026-11-12",
        }),
    );
    assert_eq!(path, "Personal/Inbox.md");
    let inbox = h.ok("vault_read_note", json!({ "path": "Personal/Inbox.md" }));
    assert_eq!(inbox["text"], "- [ ] Buy flowers 📅 2026-11-12\n");
    let path = h.ok(
        "vault_capture",
        json!({ "space": "Personal", "mode": "note", "text": "Idea", "description": "more", "due": null }),
    );
    assert_eq!(path, "Personal/Inbox.md");

    let made = h.ok(
        "vault_sticky_note",
        json!({ "path": "Work/Meetings.md", "title": "Finance", "text": "Send the summary" }),
    );
    assert_eq!(made, "Work/Stickies/Finance.md");
}
