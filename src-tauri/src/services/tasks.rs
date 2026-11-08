//! Tasks and subtasks. A task has exactly one row, whichever views show it: Tasks, Inbox,
//! a document's Tasks tabs, search and stickies all query this table (plan §2.2).

use chrono::NaiveDate;
use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use super::notes::live_document_space;
use super::{next_order, resolve_space, split_list};
use crate::domain::change::{ChangeSet, EntityKind};
use crate::domain::model::{Task, TaskDetail, TasksTabShow, TasksTabSort};
use crate::domain::text::{DESCRIPTION_MAX_BYTES, require_max_bytes, require_name};
use crate::domain::time::{format_date, parse_date};
use crate::domain::{new_id, time::now};
use crate::error::{AppError, AppResult};

pub(crate) const TASK_SELECT: &str = "
    SELECT t.id, t.space_id, t.document_id, d.title, d.archived_at IS NOT NULL, t.parent_task_id,
           t.title, t.description, t.status, t.due_date, t.completed_at, t.sort_order, t.rev,
           (SELECT count(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.deleted_at IS NULL),
           (SELECT count(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.deleted_at IS NULL
                                           AND s.status = 'completed'),
           (SELECT group_concat(name, char(31)) FROM
               (SELECT g.name FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
                WHERE tt.task_id = t.id ORDER BY g.name COLLATE NOCASE)),
           EXISTS (SELECT 1 FROM sticky_windows w WHERE w.target_kind = 'task' AND w.target_id = t.id),
           t.triaged_at, t.created_at, t.updated_at, t.deleted_at
      FROM tasks t LEFT JOIN notes d ON d.id = t.document_id";

pub(crate) fn map_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        space_id: row.get(1)?,
        document_id: row.get(2)?,
        document_title: row.get(3)?,
        document_archived: row.get::<_, Option<bool>>(4)?.unwrap_or(false),
        parent_task_id: row.get(5)?,
        title: row.get(6)?,
        description: row.get(7)?,
        status: row.get(8)?,
        due_date: row.get(9)?,
        completed_at: row.get(10)?,
        sort_order: row.get(11)?,
        rev: row.get(12)?,
        subtask_count: row.get(13)?,
        subtask_done: row.get(14)?,
        tags: split_list(row.get(15)?),
        pinned: row.get(16)?,
        triaged_at: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
        deleted_at: row.get(20)?,
    })
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Task> {
    conn.query_row(&format!("{TASK_SELECT} WHERE t.id = ?1"), [id], map_task)
        .optional()?
        .ok_or(AppError::NotFound { entity: "task" })
}

pub fn subtasks(conn: &Connection, parent_id: &str) -> AppResult<Vec<Task>> {
    let mut stmt = conn.prepare_cached(&format!(
        "{TASK_SELECT} WHERE t.parent_task_id = ?1 AND t.deleted_at IS NULL
         ORDER BY t.sort_order, t.created_at"
    ))?;
    let rows = stmt.query_map([parent_id], map_task)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn detail(conn: &Connection, id: &str) -> AppResult<TaskDetail> {
    let task = get(conn, id)?;
    let parent_title = match &task.parent_task_id {
        Some(parent) => Some(get(conn, parent)?.title),
        None => None,
    };
    Ok(TaskDetail {
        subtasks: subtasks(conn, id)?,
        parent_title,
        task,
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, TS, Default)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "bindings/")]
pub enum TaskView {
    /// Open tasks: overdue, today, upcoming and undated.
    #[default]
    All,
    /// Open tasks due today or earlier.
    Today,
    /// Open tasks due after today.
    Upcoming,
    /// Completed tasks, most recently completed first.
    Completed,
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct TaskQuery {
    pub view: TaskView,
    #[ts(optional)]
    pub space_id: Option<String>,
    #[ts(optional)]
    pub document_id: Option<String>,
}

/// Lists top-level tasks for a global view. `today` is the user's local date.
pub fn list(conn: &Connection, query: &TaskQuery, today: NaiveDate) -> AppResult<Vec<Task>> {
    let (filter, order) = match query.view {
        // `?3` (today) is referenced by every filter so the statement always binds 3 params.
        TaskView::All => (
            "t.status = 'open' AND ?3 IS NOT NULL",
            "t.due_date IS NULL, t.due_date, t.sort_order, t.created_at",
        ),
        TaskView::Today => (
            "t.status = 'open' AND t.due_date <= ?3",
            "t.due_date, t.sort_order, t.created_at",
        ),
        TaskView::Upcoming => (
            "t.status = 'open' AND t.due_date > ?3",
            "t.due_date, t.sort_order, t.created_at",
        ),
        TaskView::Completed => (
            "t.status = 'completed' AND ?3 IS NOT NULL",
            "t.completed_at DESC, t.id DESC",
        ),
    };
    let sql = format!(
        "{TASK_SELECT}
         WHERE t.deleted_at IS NULL AND t.parent_task_id IS NULL AND {filter}
           AND (?1 IS NULL OR t.space_id = ?1)
           AND (?2 IS NULL OR t.document_id = ?2)
         ORDER BY {order}"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    let rows = stmt.query_map(
        params![query.space_id, query.document_id, format_date(today)],
        map_task,
    )?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Tasks shown by a document's Tasks tab, using that tab's settings.
pub fn list_for_document(
    conn: &Connection,
    document_id: &str,
    show: TasksTabShow,
    sort: TasksTabSort,
) -> AppResult<Vec<Task>> {
    let filter = match show {
        TasksTabShow::Open => "AND t.status = 'open'",
        TasksTabShow::Completed => "AND t.status = 'completed'",
        TasksTabShow::All => "",
    };
    let order = match sort {
        TasksTabSort::Manual => "t.sort_order, t.created_at",
        TasksTabSort::DueDate => "t.due_date IS NULL, t.due_date, t.sort_order, t.created_at",
    };
    let sql = format!(
        "{TASK_SELECT}
         WHERE t.deleted_at IS NULL AND t.parent_task_id IS NULL AND t.document_id = ?1 {filter}
         ORDER BY {order}"
    );
    let mut stmt = conn.prepare_cached(&sql)?;
    let rows = stmt.query_map([document_id], map_task)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn count_completed(conn: &Connection, space_id: Option<&str>) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT count(*) FROM tasks
         WHERE deleted_at IS NULL AND parent_task_id IS NULL AND status = 'completed'
           AND (?1 IS NULL OR space_id = ?1)",
        [space_id],
        |r| r.get(0),
    )?)
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct CreateTask {
    pub title: String,
    pub description: String,
    #[ts(optional)]
    pub space_id: Option<String>,
    #[ts(optional)]
    pub document_id: Option<String>,
    #[ts(optional)]
    pub parent_task_id: Option<String>,
    #[ts(optional)]
    pub due_date: Option<String>,
}

pub fn create(tx: &Transaction<'_>, input: CreateTask) -> AppResult<(Task, ChangeSet)> {
    let title = require_name(&input.title, "Task title", 500)?;
    require_max_bytes(&input.description, DESCRIPTION_MAX_BYTES, "The description")?;
    let due_date = match input.due_date.as_deref() {
        Some(date) => Some(format_date(parse_date(date)?)),
        None => None,
    };
    let mut changes = ChangeSet::new();
    let (space_id, document_id, parent_id, due_date) = match &input.parent_task_id {
        // Subtasks inherit space and document and carry no date (UX spec §4.4).
        Some(parent_id) => {
            let parent = get(tx, parent_id)?;
            if parent.parent_task_id.is_some() {
                return Err(AppError::validation("subtasks cannot have subtasks"));
            }
            if parent.deleted_at.is_some() {
                return Err(AppError::validation("restore the parent task first"));
            }
            changes.add(EntityKind::Task, parent_id.clone());
            (
                parent.space_id,
                parent.document_id,
                Some(parent_id.clone()),
                None,
            )
        }
        None => match &input.document_id {
            Some(document_id) => {
                changes.add(EntityKind::Note, document_id.clone());
                (
                    live_document_space(tx, document_id)?,
                    Some(document_id.clone()),
                    None,
                    due_date,
                )
            }
            None => (
                resolve_space(tx, input.space_id.as_deref())?,
                None,
                None,
                due_date,
            ),
        },
    };
    let order = match &parent_id {
        Some(parent) => next_order(
            tx,
            "SELECT max(sort_order) FROM tasks WHERE parent_task_id = ?1",
            [parent],
        )?,
        None => next_order(
            tx,
            "SELECT max(sort_order) FROM tasks WHERE parent_task_id IS NULL",
            [],
        )?,
    };
    let id = new_id();
    let ts = now();
    tx.execute(
        "INSERT INTO tasks (id, space_id, document_id, parent_task_id, title, description,
                            due_date, sort_order, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![
            id,
            space_id,
            document_id,
            parent_id,
            title,
            input.description,
            due_date,
            order,
            ts
        ],
    )?;
    changes.add(EntityKind::Task, &id);
    Ok((get(tx, &id)?, changes))
}

#[derive(Debug, Clone, Default, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[ts(export, export_to = "bindings/")]
pub struct UpdateTaskText {
    #[ts(optional)]
    pub title: Option<String>,
    #[ts(optional)]
    pub description: Option<String>,
}

/// Saves edited title/description, guarded by `expected_rev` against concurrent edits.
pub fn update_text(
    tx: &Transaction<'_>,
    id: &str,
    expected_rev: i64,
    patch: UpdateTaskText,
) -> AppResult<(Task, ChangeSet)> {
    let task = get(tx, id)?;
    if task.rev != expected_rev {
        return Err(AppError::Conflict { entity: "task" });
    }
    let title = match patch.title {
        Some(title) => require_name(&title, "Task title", 500)?,
        None => task.title,
    };
    let description = patch.description.unwrap_or(task.description);
    require_max_bytes(&description, DESCRIPTION_MAX_BYTES, "The description")?;
    tx.execute(
        "UPDATE tasks SET title = ?1, description = ?2, rev = rev + 1, updated_at = ?3
         WHERE id = ?4 AND rev = ?5",
        params![title, description, now(), id, expected_rev],
    )?;
    let task = get(tx, id)?;
    let changes = changes_for(&task);
    Ok((task, changes))
}

/// Changes to broadcast for a task: itself, its parent and its document.
fn changes_for(task: &Task) -> ChangeSet {
    let mut changes = ChangeSet::new().with(EntityKind::Task, &task.id);
    if let Some(parent) = &task.parent_task_id {
        changes.add(EntityKind::Task, parent.clone());
    }
    if let Some(document) = &task.document_id {
        changes.add(EntityKind::Note, document.clone());
    }
    changes
}

/// Completes or reopens a task. Idempotent; subtasks and parent are left unchanged.
pub fn set_completed(
    tx: &Transaction<'_>,
    id: &str,
    completed: bool,
) -> AppResult<(Task, ChangeSet)> {
    let ts = now();
    let changed = tx.execute(
        "UPDATE tasks SET status = CASE WHEN ?1 THEN 'completed' ELSE 'open' END,
                          completed_at = CASE WHEN ?1 THEN coalesce(completed_at, ?2) END,
                          updated_at = ?2
         WHERE id = ?3 AND deleted_at IS NULL",
        params![completed, ts, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound { entity: "task" });
    }
    let task = get(tx, id)?;
    let changes = changes_for(&task);
    Ok((task, changes))
}

pub fn set_due_date(
    tx: &Transaction<'_>,
    id: &str,
    due_date: Option<&str>,
) -> AppResult<(Task, ChangeSet)> {
    let task = get(tx, id)?;
    if task.parent_task_id.is_some() && due_date.is_some() {
        return Err(AppError::validation("subtasks don't have due dates"));
    }
    let due_date = due_date.map(parse_date).transpose()?.map(format_date);
    tx.execute(
        "UPDATE tasks SET due_date = ?1, updated_at = ?2 WHERE id = ?3",
        params![due_date, now(), id],
    )?;
    let task = get(tx, id)?;
    let changes = changes_for(&task);
    Ok((task, changes))
}

fn ensure_top_level(task: &Task) -> AppResult<()> {
    if task.parent_task_id.is_some() {
        return Err(AppError::validation("subtasks follow their parent task"));
    }
    Ok(())
}

/// Moves a task and its subtasks to another space. A task linked to a document in another
/// space loses the link (a document's tasks always share its space).
pub fn move_to_space(
    tx: &Transaction<'_>,
    id: &str,
    space_id: &str,
) -> AppResult<(Task, ChangeSet)> {
    let task = get(tx, id)?;
    ensure_top_level(&task)?;
    resolve_space(tx, Some(space_id))?;
    let mut changes = changes_for(&task);
    let keep_document = match &task.document_id {
        Some(doc) => live_document_space(tx, doc).ok().as_deref() == Some(space_id),
        None => true,
    };
    let ts = now();
    tx.execute(
        "UPDATE tasks SET space_id = ?1, updated_at = ?2,
                          document_id = CASE WHEN ?3 THEN document_id END
         WHERE id = ?4 OR parent_task_id = ?4",
        params![space_id, ts, keep_document, id],
    )?;
    let task = get(tx, id)?;
    changes.extend(changes_for(&task));
    Ok((task, changes))
}

/// Links a task (and its subtasks) to a document, adopting its space; `None` unlinks.
pub fn set_document(
    tx: &Transaction<'_>,
    id: &str,
    document_id: Option<&str>,
) -> AppResult<(Task, ChangeSet)> {
    let task = get(tx, id)?;
    ensure_top_level(&task)?;
    let mut changes = changes_for(&task);
    let space_id = match document_id {
        Some(doc) => live_document_space(tx, doc)?,
        None => task.space_id.clone(),
    };
    let ts = now();
    // Append to the end of the document's manual order.
    let order = match document_id {
        Some(doc) => next_order(
            tx,
            "SELECT max(sort_order) FROM tasks WHERE document_id = ?1 AND parent_task_id IS NULL",
            [doc],
        )?
        .max(task.sort_order),
        None => task.sort_order,
    };
    tx.execute(
        "UPDATE tasks SET document_id = ?1, space_id = ?2, updated_at = ?3
         WHERE id = ?4 OR parent_task_id = ?4",
        params![document_id, space_id, ts, id],
    )?;
    tx.execute(
        "UPDATE tasks SET sort_order = ?1 WHERE id = ?2",
        params![order, id],
    )?;
    let task = get(tx, id)?;
    changes.extend(changes_for(&task));
    Ok((task, changes))
}

/// Applies a manual order to sibling tasks (same parent, e.g. one section or one document).
/// The block keeps its position relative to unlisted siblings: it starts at the smallest
/// current `sort_order` among `ids`.
pub fn reorder(tx: &Transaction<'_>, ids: &[String]) -> AppResult<ChangeSet> {
    let Some(first) = ids.first() else {
        return Ok(ChangeSet::new());
    };
    let parent = get(tx, first)?.parent_task_id;
    let mut changes = ChangeSet::new();
    let mut base = i64::MAX;
    for id in ids {
        let task = get(tx, id)?;
        if task.parent_task_id != parent || task.deleted_at.is_some() {
            return Err(AppError::validation(
                "only sibling tasks can be reordered together",
            ));
        }
        base = base.min(task.sort_order);
        changes.extend(changes_for(&task));
    }
    let mut unique = ids.to_vec();
    unique.sort();
    unique.dedup();
    if unique.len() != ids.len() {
        return Err(AppError::validation("each task can appear only once"));
    }
    let mut stmt = tx.prepare_cached("UPDATE tasks SET sort_order = ?1 WHERE id = ?2")?;
    for (index, id) in ids.iter().enumerate() {
        let offset = i64::try_from(index).unwrap_or(0) * super::ORDER_STEP;
        stmt.execute(params![base.saturating_add(offset), id])?;
    }
    Ok(changes)
}

pub fn trash(tx: &Transaction<'_>, id: &str) -> AppResult<ChangeSet> {
    let task = get(tx, id)?;
    tx.execute(
        "UPDATE tasks SET deleted_at = coalesce(deleted_at, ?1) WHERE id = ?2",
        params![now(), id],
    )?;
    Ok(changes_for(&task))
}

/// Restores a task from Trash. A subtask brings its parent back too. The flag reports that the
/// task came back without its document (because that document is in Trash or gone).
pub fn restore(tx: &Transaction<'_>, id: &str) -> AppResult<(bool, ChangeSet)> {
    let task = get(tx, id)?;
    let mut changes = changes_for(&task);
    if let Some(parent) = &task.parent_task_id {
        let (unlinked, parent_changes) = restore(tx, parent)?;
        changes.extend(parent_changes);
        tx.execute("UPDATE tasks SET deleted_at = NULL WHERE id = ?1", [id])?;
        return Ok((unlinked, changes));
    }
    let document_alive = match &task.document_id {
        Some(doc) => live_document_space(tx, doc).is_ok(),
        None => true,
    };
    tx.execute(
        "UPDATE tasks SET deleted_at = NULL, updated_at = ?1 WHERE id = ?2",
        params![now(), id],
    )?;
    if !document_alive {
        tx.execute(
            "UPDATE tasks SET document_id = NULL WHERE id = ?1 OR parent_task_id = ?1",
            [id],
        )?;
    }
    Ok((!document_alive, changes))
}

pub fn purge(tx: &Transaction<'_>, id: &str) -> AppResult<ChangeSet> {
    let task = get(tx, id)?;
    let deleted = tx.execute(
        "DELETE FROM tasks WHERE id = ?1 AND deleted_at IS NOT NULL",
        [id],
    )?;
    if deleted == 0 {
        return Err(AppError::validation(
            "only items in Trash can be deleted permanently",
        ));
    }
    Ok(changes_for(&task))
}

pub fn mark_triaged(tx: &Transaction<'_>, id: &str, triaged: bool) -> AppResult<ChangeSet> {
    tx.execute(
        "UPDATE tasks SET triaged_at = CASE WHEN ?1 THEN coalesce(triaged_at, ?2) END WHERE id = ?3",
        params![triaged, now(), id],
    )?;
    Ok(ChangeSet::new().with(EntityKind::Task, id))
}
