import { TaskItem, TaskList } from '@tiptap/extension-list';
import type { JSONContent } from '@tiptap/core';

/**
 * Editorial checklist (content only). These items are NEVER real tasks.
 *
 * Upstream calls these nodes `taskList`/`taskItem`. We rename them in the
 * canonical JSON to `checklist`/`checklistItem` so nobody can confuse them with
 * real tasks (which are only ever `taskRef` nodes). The Markdown form stays
 * GFM (`- [ ] item` / `- [x] item`), so we keep upstream's marked token names
 * (`taskList`/`taskItem`) and only rename the produced nodes.
 */

export const CHECKLIST_NODE_NAME = 'checklist';
export const CHECKLIST_ITEM_NODE_NAME = 'checklistItem';

function renameNode(result: unknown, from: string, to: string): JSONContent {
  const node = result as JSONContent;
  return node.type === from ? { ...node, type: to } : node;
}

export const Checklist = TaskList.extend({
  name: CHECKLIST_NODE_NAME,
  markdownTokenName: 'taskList',

  addOptions() {
    return { ...this.parent?.(), itemTypeName: CHECKLIST_ITEM_NODE_NAME, HTMLAttributes: {} };
  },

  parseHTML() {
    return [
      { tag: `ul[data-type="${CHECKLIST_NODE_NAME}"]`, priority: 51 },
      // Content pasted from other Tiptap editors.
      { tag: 'ul[data-type="taskList"]', priority: 51 },
    ];
  },

  parseMarkdown(token, helpers) {
    return helpers.createNode(CHECKLIST_NODE_NAME, {}, helpers.parseChildren(token.items ?? []));
  },
});

export const ChecklistItem = TaskItem.extend({
  name: CHECKLIST_ITEM_NODE_NAME,
  markdownTokenName: 'taskItem',

  addOptions() {
    return {
      ...this.parent!(),
      nested: true,
      taskListTypeName: CHECKLIST_NODE_NAME,
      a11y: {
        checkboxLabel: (node, checked) =>
          `Checklist (conteúdo): ${node.textContent || 'item vazio'}${checked ? ' — feito' : ''}`,
      },
    };
  },

  parseHTML() {
    const contentElement = (element: HTMLElement) => element.querySelector('div') ?? element;
    return [
      { tag: `li[data-type="${CHECKLIST_ITEM_NODE_NAME}"]`, priority: 51, contentElement },
      { tag: 'li[data-type="taskItem"]', priority: 51, contentElement },
    ];
  },

  parseMarkdown(token, helpers) {
    return renameNode(this.parent?.(token, helpers), 'taskItem', CHECKLIST_ITEM_NODE_NAME);
  },
});
