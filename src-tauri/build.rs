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
    "list_pinned",
    "reset_sticky_positions",
    "quit_app",
    "app_status",
    "list_spaces",
    "create_space",
    "rename_space",
    "set_space_color",
    "set_default_space",
    "space_item_count",
    "delete_space",
    "list_inbox",
    "inbox_count",
    "mark_inbox_triaged",
    "list_trash",
    "empty_trash",
    "list_tags",
    "search",
    "get_settings",
    "update_settings",
    "remember_capture_space",
    "get_capture_draft",
    "save_capture_draft",
    "clear_capture_draft",
    "export_data",
    "choose_export_folder",
    "write_export",
    "backup_database",
    "list_notes",
    "get_note",
    "create_note",
    "update_note_text",
    "discard_note_if_empty",
    "set_note_archived",
    "move_note",
    "trash_note",
    "restore_note",
    "purge_note",
    "set_note_triaged",
    "set_note_tags",
    "get_document",
    "get_tab",
    "create_document",
    "convert_note_to_document",
    "revert_document_conversion",
    "create_tab",
    "rename_tab",
    "reorder_tabs",
    "update_tab_content",
    "update_tab_settings",
    "duplicate_tab",
    "delete_tab",
    "restore_tab",
    "trash_document",
    "document_move_preview",
    "set_document_in_sidebar",
    "list_tasks",
    "list_document_tasks",
    "count_completed_tasks",
    "get_task",
    "create_task",
    "update_task_text",
    "set_task_completed",
    "set_task_due_date",
    "move_task",
    "set_task_document",
    "reorder_tasks",
    "trash_task",
    "restore_task",
    "purge_task",
    "set_task_triaged",
    "set_task_tags",
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
