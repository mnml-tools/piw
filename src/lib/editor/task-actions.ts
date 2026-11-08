import type { Editor } from '@tiptap/core';
import { CHECKLIST_ITEM_NODE_NAME } from './checklist';
import { TASK_REF_NODE_NAME } from './task-ref';

/**
 * Turns the caret's line into a reference to a real task (docs/ui-design-system.md §10, CA-05): the
 * line's text becomes the task title and is replaced by a `taskRef` to it. A checklist line first
 * leaves the editorial checklist, so the two kinds of checkbox are never mixed.
 *
 * `createTask` persists the task (Rust) and returns its id; nothing changes in the document if
 * it fails. Returns false when the line is empty or already a task reference.
 */
export async function convertLineToTask(
  editor: Editor,
  createTask: (title: string) => Promise<string>,
): Promise<boolean> {
  const { $from } = editor.state.selection;
  const block = $from.parent;
  let hasRef = false;
  block.forEach((child) => {
    if (child.type.name === TASK_REF_NODE_NAME) hasRef = true;
  });
  const title = block.textContent.trim();
  if (!title || hasRef) return false;

  const taskId = await createTask(title);

  // The document may have changed while the task was being created: find the block again.
  const inChecklist = editor.state.selection.$from.node(-1)?.type.name === CHECKLIST_ITEM_NODE_NAME;
  const chain = editor.chain().focus();
  if (inChecklist) chain.liftListItem(CHECKLIST_ITEM_NODE_NAME);
  chain.run();
  const { $from: here } = editor.state.selection;
  const from = here.start();
  const to = here.end();
  return editor
    .chain()
    .focus()
    .insertContentAt({ from, to }, { type: TASK_REF_NODE_NAME, attrs: { taskId } })
    .run();
}

/** Inserts a reference to an existing task at the caret. */
export function insertTaskRef(editor: Editor, taskId: string): boolean {
  return editor.chain().focus().insertTaskRef(taskId).run();
}
