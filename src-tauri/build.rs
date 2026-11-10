//! Build script: Tauri codegen plus the app command manifest.
//!
//! Declaring every app command here makes Tauri generate one `allow-<command>` permission per
//! command, so each window's capability (capabilities/*.json) grants only what that window
//! needs (least privilege; see docs/architecture.md#security-boundaries). A command missing here is denied at runtime.

const COMMANDS: &[&str] = &[
    "platform_info",
    "show_capture",
    "hide_capture",
    "open_in_workspace",
    "open_link",
    "retry_shortcut",
    "open_sticky",
    "close_sticky",
    "unpin_sticky",
    "set_sticky_always_on_top",
    "set_sticky_color",
    "get_sticky",
    "reset_sticky_positions",
    "quit_app",
    "app_status",
    "get_settings",
    "update_settings",
    "get_capture_draft",
    "save_capture_draft",
    "clear_capture_draft",
    "vault_status",
    "vault_tree",
    "vault_read_note",
    "vault_write_note",
    "vault_create_note",
    "vault_create_folder",
    "vault_rename",
    "vault_trash",
    "vault_list_trash",
    "vault_restore",
    "vault_purge",
    "vault_search",
    "vault_resolve_link",
    "vault_tasks",
    "vault_edit_task",
    "vault_pin_note",
    "vault_pin_tasks",
    "vault_sticky_view",
    "vault_pinned",
    "vault_capture",
    "vault_sticky_note",
    "vault_import_status",
    "vault_import",
    "choose_vault_folder",
    "spike_broadcast",
    "spike_ack",
];

/// The workspace window is the full UI: fail the build if its capability misses a command.
fn check_main_capability() {
    println!("cargo:rerun-if-changed=capabilities/main.json");
    let main = std::fs::read_to_string("capabilities/main.json").unwrap_or_default();
    let missing: Vec<&str> = COMMANDS
        .iter()
        .copied()
        .filter(|c| !main.contains(&format!("\"allow-{}\"", c.replace('_', "-"))))
        .collect();
    assert!(
        missing.is_empty(),
        "capabilities/main.json does not grant: {missing:?}"
    );
}

fn main() {
    check_main_capability();
    let attributes = tauri_build::Attributes::new()
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    if let Err(error) = tauri_build::try_build(attributes) {
        panic!("tauri-build failed: {error:#}");
    }
}
