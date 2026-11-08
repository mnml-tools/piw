//! Notes and documents commands.

use tauri::{AppHandle, Runtime, WebviewWindow};

use super::scope::{self, Access};
use super::support::{read, write};
use crate::domain::model::{Document, Note, NoteListItem, Tab, TabKind, TasksTabSettings};
use crate::error::AppResult;
use crate::services::documents::{self, CreateDocument, LinkedTasks, MovePreview};
use crate::services::notes::{self, CreateNote, NoteQuery, UpdateNoteText};
use crate::services::tags::{self, Tagged};

#[tauri::command]
pub async fn list_notes<R: Runtime>(
    app: AppHandle<R>,
    query: NoteQuery,
) -> AppResult<Vec<NoteListItem>> {
    read(&app, move |c| notes::list(c, &query)).await
}

#[tauri::command]
pub async fn get_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<Note> {
    read(&app, move |c| {
        scope::check(c, &window, Access::Note(&id))?;
        notes::get(c, &id)
    })
    .await
}

#[tauri::command]
pub async fn create_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    input: CreateNote,
) -> AppResult<Note> {
    write(&app, &window, move |tx| notes::create(tx, input)).await
}

#[tauri::command]
pub async fn update_note_text<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    expected_rev: i64,
    patch: UpdateNoteText,
) -> AppResult<Note> {
    let caller = window.clone();
    write(&app, &window, move |tx| {
        scope::check(tx, &caller, Access::Note(&id))?;
        notes::update_text(tx, &id, expected_rev, patch)
    })
    .await
}

#[tauri::command]
pub async fn discard_note_if_empty<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<bool> {
    write(&app, &window, move |tx| notes::discard_if_empty(tx, &id)).await
}

#[tauri::command]
pub async fn set_note_archived<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    archived: bool,
) -> AppResult<Note> {
    write(&app, &window, move |tx| {
        notes::set_archived(tx, &id, archived)
    })
    .await
}

#[tauri::command]
pub async fn move_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    space_id: String,
) -> AppResult<Note> {
    write(&app, &window, move |tx| {
        notes::move_to_space(tx, &id, &space_id)
    })
    .await
}

#[tauri::command]
pub async fn trash_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        notes::trash(tx, &id).map(|c| ((), c))
    })
    .await?;
    super::stickies::reconcile(&app, None);
    Ok(())
}

/// Returns true when the note came back without its document.
#[tauri::command]
pub async fn restore_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<bool> {
    let target = crate::platform::labels::StickyTarget {
        kind: crate::platform::labels::StickyKind::Note,
        id: id.clone(),
    };
    let result = write(&app, &window, move |tx| notes::restore(tx, &id)).await?;
    super::stickies::reconcile(&app, Some(&target));
    Ok(result)
}

#[tauri::command]
pub async fn purge_note<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        notes::purge(tx, &id).map(|c| ((), c))
    })
    .await?;
    super::stickies::reconcile(&app, None);
    Ok(())
}

#[tauri::command]
pub async fn set_note_triaged<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    triaged: bool,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        notes::mark_triaged(tx, &id, triaged).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn set_note_tags<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    tags: Vec<String>,
) -> AppResult<Vec<String>> {
    write(&app, &window, move |tx| {
        tags::set(tx, Tagged::Note, &id, &tags)
    })
    .await
}

// ------------------------------------------------------------------ documents

#[tauri::command]
pub async fn get_document<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<Document> {
    read(&app, move |c| {
        scope::check(c, &window, Access::Document(&id))?;
        documents::get(c, &id)
    })
    .await
}

#[tauri::command]
pub async fn get_tab<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<Tab> {
    read(&app, move |c| {
        scope::check(c, &window, Access::Tab(&id))?;
        documents::get_tab(c, &id)
    })
    .await
}

#[tauri::command]
pub async fn create_document<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    input: CreateDocument,
) -> AppResult<Document> {
    write(&app, &window, move |tx| documents::create(tx, input)).await
}

/// `contentJson`/`plainText` carry the editor's conversion of the note text (docs/architecture.md#documents-and-the-editor).
#[tauri::command]
pub async fn convert_note_to_document<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    content_json: Option<String>,
    plain_text: Option<String>,
) -> AppResult<Document> {
    let content = content_json.zip(plain_text);
    write(&app, &window, move |tx| {
        documents::convert_from_note(tx, &id, content)
    })
    .await
}

#[tauri::command]
pub async fn revert_document_conversion<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    title: String,
    body: String,
) -> AppResult<Note> {
    write(&app, &window, move |tx| {
        documents::revert_conversion(tx, &id, &title, &body)
    })
    .await
}

#[tauri::command]
pub async fn create_tab<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    document_id: String,
    kind: TabKind,
    title: String,
) -> AppResult<Tab> {
    write(&app, &window, move |tx| {
        documents::create_tab(tx, &document_id, kind, &title)
    })
    .await
}

#[tauri::command]
pub async fn rename_tab<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    title: String,
) -> AppResult<Tab> {
    write(&app, &window, move |tx| {
        documents::rename_tab(tx, &id, &title)
    })
    .await
}

#[tauri::command]
pub async fn reorder_tabs<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    document_id: String,
    ids: Vec<String>,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        documents::reorder_tabs(tx, &document_id, &ids).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn update_tab_content<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    expected_rev: i64,
    content_json: String,
    plain_text: String,
) -> AppResult<Tab> {
    write(&app, &window, move |tx| {
        documents::update_tab_content(tx, &id, expected_rev, &content_json, &plain_text)
    })
    .await
}

#[tauri::command]
pub async fn update_tab_settings<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    settings: TasksTabSettings,
) -> AppResult<Tab> {
    write(&app, &window, move |tx| {
        documents::update_tab_settings(tx, &id, &settings)
    })
    .await
}

#[tauri::command]
pub async fn duplicate_tab<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<Tab> {
    write(&app, &window, move |tx| documents::duplicate_tab(tx, &id)).await
}

#[tauri::command]
pub async fn delete_tab<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        documents::delete_tab(tx, &id).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn restore_tab<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<Tab> {
    write(&app, &window, move |tx| documents::restore_tab(tx, &id)).await
}

#[tauri::command]
pub async fn trash_document<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    linked_tasks: LinkedTasks,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        documents::trash(tx, &id, linked_tasks).map(|c| ((), c))
    })
    .await?;
    super::stickies::reconcile(&app, None);
    Ok(())
}

#[tauri::command]
pub async fn document_move_preview<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> AppResult<MovePreview> {
    read(&app, move |c| documents::move_preview(c, &id)).await
}

#[tauri::command]
pub async fn set_document_in_sidebar<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    in_sidebar: bool,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        documents::set_in_sidebar(tx, &id, in_sidebar).map(|c| ((), c))
    })
    .await
}
