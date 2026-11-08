import { mergeAttributes, Node } from '@tiptap/core';
import type { JSONContent, MarkdownToken, MarkdownTokenizer } from '@tiptap/core';

/**
 * `taskRef` — inline atom that *references* a real task stored by the Rust core.
 *
 * Contract (see docs/architecture.md#documents-and-the-editor):
 * - the node has exactly one attribute, `taskId` (lower-case hyphenated UUID);
 * - it never stores title, status or any other task data (no duplication);
 * - Markdown form is `[[task:<uuid>]]` and round-trips losslessly;
 * - HTML form is `<span data-task-ref="<uuid>"></span>` (no text inside, so a
 *   copy/paste between documents carries only the reference);
 * - rendering of title/status is done by a NodeView that reads from an
 *   external store (see src/react/TaskRefView.tsx).
 */

export const TASK_REF_NODE_NAME = 'taskRef';

/** Generic 8-4-4-4-12 hex UUID (any version: v4 and v7 are both accepted). */
const UUID_SOURCE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const UUID_RE = new RegExp(`^${UUID_SOURCE}$`);
/** Anchored at the start of the remaining source, as marked tokenizers require. */
const TASK_REF_MD_RE = new RegExp(`^\\[\\[task:(${UUID_SOURCE})\\]\\]`);

export const TASK_REF_MARKDOWN_PREFIX = '[[task:';

export function isTaskId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Canonical form: lower-case. Returns null for anything that is not a UUID. */
export function normalizeTaskId(value: unknown): string | null {
  return isTaskId(value) ? value.toLowerCase() : null;
}

export function taskRefToMarkdown(taskId: string): string {
  return `${TASK_REF_MARKDOWN_PREFIX}${taskId}]]`;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskRef: {
      /** Insert a reference to an existing task. Returns false for an invalid id. */
      insertTaskRef: (taskId: string) => ReturnType;
    };
  }
}

const taskRefTokenizer: MarkdownTokenizer = {
  name: TASK_REF_NODE_NAME,
  level: 'inline',
  start: (src: string) => src.indexOf(TASK_REF_MARKDOWN_PREFIX),
  tokenize: (src: string): MarkdownToken | undefined => {
    const match = TASK_REF_MD_RE.exec(src);
    if (!match || match[1] === undefined) {
      return undefined;
    }
    return {
      type: TASK_REF_NODE_NAME,
      raw: match[0],
      taskId: match[1].toLowerCase(),
    };
  },
};

export const TaskRef = Node.create({
  name: TASK_REF_NODE_NAME,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      taskId: {
        default: null,
        // Read from data-task-ref only; anything else (title text, data-title…) is ignored.
        parseHTML: (element: HTMLElement) => normalizeTaskId(element.getAttribute('data-task-ref')),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-task-ref': typeof attributes['taskId'] === 'string' ? attributes['taskId'] : '',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-task-ref]',
        // Reject references without a valid UUID instead of creating dangling nodes.
        getAttrs: (element: HTMLElement) =>
          normalizeTaskId(element.getAttribute('data-task-ref')) === null ? false : null,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'task-ref' }, HTMLAttributes)];
  },

  // Used by editor.getText()/generateText. Plain-text extraction for search
  // lives in serialization.ts and deliberately does not use the task title.
  renderText({ node }) {
    const id = normalizeTaskId(node.attrs['taskId']);
    return id === null ? '' : taskRefToMarkdown(id);
  },

  markdownTokenName: TASK_REF_NODE_NAME,
  markdownTokenizer: taskRefTokenizer,

  parseMarkdown: (token: MarkdownToken, helpers) => {
    const taskId = normalizeTaskId(token['taskId']);
    if (taskId === null) {
      return helpers.createTextNode(token.raw ?? '');
    }
    return helpers.createNode(TASK_REF_NODE_NAME, { taskId });
  },

  renderMarkdown: (node: JSONContent) => {
    const taskId = normalizeTaskId(node.attrs?.['taskId']);
    return taskId === null ? '' : taskRefToMarkdown(taskId);
  },

  addCommands() {
    return {
      insertTaskRef:
        (taskId: string) =>
        ({ commands }) => {
          const id = normalizeTaskId(taskId);
          if (id === null) {
            return false;
          }
          return commands.insertContent({ type: this.name, attrs: { taskId: id } });
        },
    };
  },
});
