//! Task commands.

use tauri::{AppHandle, Runtime, WebviewWindow};

use super::scope::{self, Access};
use super::support::{read, write};
use crate::domain::model::{Task, TaskDetail, TasksTabShow, TasksTabSort};
use crate::domain::time::local_today;
use crate::error::AppResult;
use crate::services::tags::{self, Tagged};
use crate::services::tasks::{self, CreateTask, TaskQuery, UpdateTaskText};

#[tauri::command]
pub async fn list_tasks<R: Runtime>(app: AppHandle<R>, query: TaskQuery) -> AppResult<Vec<Task>> {
    read(&app, move |c| tasks::list(c, &query, local_today())).await
}

#[tauri::command]
pub async fn list_document_tasks<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    document_id: String,
    show: TasksTabShow,
    sort: TasksTabSort,
) -> AppResult<Vec<Task>> {
    read(&app, move |c| {
        scope::check(c, &window, Access::Document(&document_id))?;
        tasks::list_for_document(c, &document_id, show, sort)
    })
    .await
}

#[tauri::command]
pub async fn count_completed_tasks<R: Runtime>(
    app: AppHandle<R>,
    space_id: Option<String>,
) -> AppResult<i64> {
    read(&app, move |c| {
        tasks::count_completed(c, space_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn get_task<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<TaskDetail> {
    read(&app, move |c| {
        scope::check(c, &window, Access::Task(&id))?;
        tasks::detail(c, &id)
    })
    .await
}

#[tauri::command]
pub async fn create_task<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    input: CreateTask,
) -> AppResult<Task> {
    let caller = window.clone();
    write(&app, &window, move |tx| {
        let access = Access::CreateTask {
            parent: input.parent_task_id.as_deref(),
            document: input.document_id.as_deref(),
        };
        scope::check(tx, &caller, access)?;
        tasks::create(tx, input)
    })
    .await
}

#[tauri::command]
pub async fn update_task_text<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    expected_rev: i64,
    patch: UpdateTaskText,
) -> AppResult<Task> {
    let caller = window.clone();
    write(&app, &window, move |tx| {
        scope::check(tx, &caller, Access::Task(&id))?;
        tasks::update_text(tx, &id, expected_rev, patch)
    })
    .await
}

#[tauri::command]
pub async fn set_task_completed<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    completed: bool,
) -> AppResult<Task> {
    let caller = window.clone();
    write(&app, &window, move |tx| {
        scope::check(tx, &caller, Access::Task(&id))?;
        tasks::set_completed(tx, &id, completed)
    })
    .await
}

#[tauri::command]
pub async fn set_task_due_date<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    due_date: Option<String>,
) -> AppResult<Task> {
    write(&app, &window, move |tx| {
        tasks::set_due_date(tx, &id, due_date.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn move_task<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    space_id: String,
) -> AppResult<Task> {
    write(&app, &window, move |tx| {
        tasks::move_to_space(tx, &id, &space_id)
    })
    .await
}

#[tauri::command]
pub async fn set_task_document<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    document_id: Option<String>,
) -> AppResult<Task> {
    write(&app, &window, move |tx| {
        tasks::set_document(tx, &id, document_id.as_deref())
    })
    .await
}

#[tauri::command]
pub async fn reorder_tasks<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    ids: Vec<String>,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        tasks::reorder(tx, &ids).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn trash_task<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        tasks::trash(tx, &id).map(|c| ((), c))
    })
    .await?;
    super::stickies::reconcile(&app, None);
    Ok(())
}

/// Returns true when the task came back without its document.
#[tauri::command]
pub async fn restore_task<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<bool> {
    let target = crate::platform::labels::StickyTarget {
        kind: crate::platform::labels::StickyKind::Task,
        id: id.clone(),
    };
    let result = write(&app, &window, move |tx| tasks::restore(tx, &id)).await?;
    super::stickies::reconcile(&app, Some(&target));
    Ok(result)
}

#[tauri::command]
pub async fn purge_task<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        tasks::purge(tx, &id).map(|c| ((), c))
    })
    .await?;
    super::stickies::reconcile(&app, None);
    Ok(())
}

#[tauri::command]
pub async fn set_task_triaged<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    triaged: bool,
) -> AppResult<()> {
    write(&app, &window, move |tx| {
        tasks::mark_triaged(tx, &id, triaged).map(|c| ((), c))
    })
    .await
}

#[tauri::command]
pub async fn set_task_tags<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    id: String,
    tags: Vec<String>,
) -> AppResult<Vec<String>> {
    write(&app, &window, move |tx| {
        tags::set(tx, Tagged::Task, &id, &tags)
    })
    .await
}
