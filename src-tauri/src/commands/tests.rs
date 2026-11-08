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

struct Harness {
    _app: App<MockRuntime>,
    window: WebviewWindow<MockRuntime>,
    events: Arc<Mutex<Vec<Value>>>,
}

fn harness_with(data: Result<Arc<Database>, String>) -> Harness {
    let app = mock_builder()
        .manage(DataState(data))
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
    let db = Database::open_in_memory().unwrap();
    db.write(crate::services::spaces::ensure_seeded).unwrap();
    harness_with(Ok(Arc::new(db)))
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
fn creates_and_edits_a_note_with_camel_case_arguments() {
    let h = harness();
    let note = h.ok(
        "create_note",
        json!({ "input": { "title": "", "body": "Ligar ao fornecedor" } }),
    );
    assert_eq!(note["displayTitle"], "Ligar ao fornecedor");
    assert_eq!(note["kind"], "quick_note");
    let id = note["id"].as_str().unwrap();
    let saved = h.ok(
        "update_note_text",
        json!({ "id": id, "expectedRev": 1, "patch": { "body": "Ligar amanhã" } }),
    );
    assert_eq!(saved["rev"], 2);
    let stale = h
        .invoke(
            "update_note_text",
            json!({ "id": id, "expectedRev": 1, "patch": { "body": "x" } }),
        )
        .unwrap_err();
    assert_eq!(stale["code"], "conflict");
}

#[test]
fn writes_broadcast_what_changed_and_which_window_did_it() {
    let h = harness();
    let doc = h.ok(
        "create_document",
        json!({ "input": { "title": "Refactor 2FA" } }),
    );
    let doc_id = doc["note"]["id"].as_str().unwrap().to_owned();
    h.events.lock().unwrap().clear();
    let task = h.ok(
        "create_task",
        json!({ "input": { "title": "Adicionar testes unitários", "documentId": doc_id } }),
    );
    let events = h.events.lock().unwrap().clone();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["origin"], "main");
    let changes = events[0]["changes"].as_array().unwrap();
    assert!(changes.contains(&json!({ "kind": "task", "id": task["id"] })));
    assert!(changes.contains(&json!({ "kind": "note", "id": doc_id })));

    let listed = h.ok(
        "list_tasks",
        json!({ "query": { "view": "all", "spaceId": task["spaceId"] } }),
    );
    assert_eq!(listed[0]["id"], task["id"]);
    let in_tab = h.ok(
        "list_document_tasks",
        json!({ "documentId": doc_id, "show": "open", "sort": "manual" }),
    );
    assert_eq!(in_tab[0]["id"], task["id"]);
}

#[test]
fn reads_do_not_broadcast() {
    let h = harness();
    h.ok("list_spaces", json!({}));
    h.ok("search", json!({ "query": "anything" }));
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
        .invoke("create_note", json!({ "input": { "body": "   " } }))
        .unwrap_err();
    assert_eq!(error["code"], "validation");
    let error = h
        .invoke("get_task", json!({ "id": "missing" }))
        .unwrap_err();
    assert_eq!(error["code"], "not_found");
}

#[test]
fn a_database_that_failed_to_open_is_reported_not_fatal() {
    let h = harness_with(Err("schema v9 is newer than this Piw".into()));
    let status = h.ok("app_status", json!({}));
    assert_eq!(status["dataError"], "schema v9 is newer than this Piw");
    let error = h.invoke("list_spaces", json!({})).unwrap_err();
    assert_eq!(error["code"], "storage");
}

#[test]
fn commands_are_refused_from_remote_origins() {
    let h = harness();
    let request = InvokeRequest {
        cmd: "list_spaces".into(),
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
    let h = harness();
    let task = h.ok("create_task", json!({ "input": { "title": "Pin me" } }));
    let target = json!({ "kind": "task", "id": task["id"] });
    assert_eq!(h.ok("open_sticky", json!({ "target": target })), 1);
    // Pinning again focuses the same window instead of creating another.
    assert_eq!(h.ok("open_sticky", json!({ "target": target })), 1);
    let label = format!("sticky:task:{}", task["id"].as_str().unwrap());
    assert!(h._app.get_webview_window(&label).is_some());
    assert_eq!(
        h.ok("get_task", json!({ "id": task["id"] }))["task"]["pinned"],
        true
    );

    h.ok("close_sticky", json!({ "target": target }));
    let pinned = h.ok("list_pinned", json!({}));
    assert_eq!(pinned[0]["isOpen"], false, "hidden, still pinned");

    h.ok("unpin_sticky", json!({ "target": target }));
    assert_eq!(h.ok("list_pinned", json!({})), json!([]));
}

#[test]
fn trashing_a_pinned_item_leaves_pinned_and_undo_keeps_it_open() {
    let h = harness();
    let task = h.ok(
        "create_task",
        json!({ "input": { "title": "Pinned then trashed" } }),
    );
    let id = task["id"].as_str().unwrap().to_owned();
    h.ok(
        "open_sticky",
        json!({ "target": { "kind": "task", "id": id } }),
    );
    let label = format!("sticky:task:{id}");
    h.ok("trash_task", json!({ "id": id }));
    // (The mock runtime never removes destroyed windows; the native E2E scenario checks that
    // the window really closes.)
    assert_eq!(
        h.ok("list_pinned", json!({})),
        json!([]),
        "trashed items leave Pinned"
    );
    h.ok("restore_task", json!({ "id": id }));
    assert!(h._app.get_webview_window(&label).is_some());
    assert_eq!(
        h.ok("list_pinned", json!({}))[0]["isOpen"],
        true,
        "undo keeps it open"
    );
}

#[test]
fn a_sticky_window_can_only_touch_its_own_item() {
    let h = harness();
    let mine = h.ok("create_note", json!({ "input": { "body": "mine" } }));
    let other = h.ok(
        "create_note",
        json!({ "input": { "body": "someone else's" } }),
    );
    let label = format!("sticky:note:{}", mine["id"].as_str().unwrap());
    let sticky = WebviewWindowBuilder::new(&h._app, &label, Default::default())
        .build()
        .expect("sticky window");
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
    assert!(call("get_note", json!({ "id": mine["id"] })).is_ok());
    let denied = call("get_note", json!({ "id": other["id"] })).unwrap_err();
    assert_eq!(denied["code"], "validation");
    let denied = call(
        "update_note_text",
        json!({ "id": other["id"], "expectedRev": 1, "patch": { "body": "x" } }),
    )
    .unwrap_err();
    assert_eq!(denied["code"], "validation");
    assert!(call("create_task", json!({ "input": { "title": "stray" } })).is_err());
}
