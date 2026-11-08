// Headless editor kit (framework-agnostic). React bindings live in ./react.
export { CHECKLIST_ITEM_NODE_NAME, CHECKLIST_NODE_NAME, Checklist, ChecklistItem } from './checklist'
export { ALLOWED_LINK_PROTOCOLS, createEditorExtensions, getDefaultLowlight, isSafeHref } from './extensions'
export type { EditorExtensionOptions } from './extensions'
export {
  emptyDoc,
  extractTaskRefIds,
  getEditorSchema,
  htmlToJson,
  isSameDoc,
  jsonToMarkdown,
  jsonToPlainText,
  markdownToJson,
  normalizeDoc,
  serializeDoc,
} from './serialization'
export type { DocJSON, PlainTextOptions } from './serialization'
export { applyExternalContent, currentDocString } from './sync'
export {
  isTaskId,
  normalizeTaskId,
  TASK_REF_MARKDOWN_PREFIX,
  TASK_REF_NODE_NAME,
  TaskRef,
  taskRefToMarkdown,
} from './task-ref'
export type { TaskRefAttributes } from './task-ref'
