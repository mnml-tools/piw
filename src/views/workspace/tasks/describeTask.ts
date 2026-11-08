import { describeDueDate } from '@/lib/dates';
import type { Space } from '@/lib/ipc/bindings/Space';
import type { Task } from '@/lib/ipc/bindings/Task';
import { tasksStrings as t } from '@/strings/tasks';

/** What the checkbox's description reads: "Overdue, 3 November, Work, 1 of 3 subtasks done". */
export function describeTask(
  task: Task,
  today: string,
  options: { space?: Space; showSpace?: boolean; showDocument?: boolean } = {},
): string {
  const parts: string[] = [];
  if (task.dueDate) parts.push(describeDueDate(task.dueDate, today));
  if (options.showSpace && options.space) parts.push(options.space.name);
  if (task.subtaskCount > 0) parts.push(t.row.subtasks(task.subtaskDone, task.subtaskCount));
  if (options.showDocument && task.documentTitle) {
    parts.push(t.row.inDocument(task.documentTitle, task.documentArchived));
  }
  return parts.join(', ');
}
