import { Extension, generateJSON, getSchema } from '@tiptap/core';
import type { AnyExtension, JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { Schema } from '@tiptap/pm/model';
import { Marked } from 'marked';
import type { marked } from 'marked';

import { CHECKLIST_NODE_NAME } from './checklist';
import { createEditorExtensions, isSafeHref } from './extensions';
import { normalizeTaskId, TASK_REF_NODE_NAME } from './task-ref';

/**
 * Serialization contract (docs/architecture.md#documents-and-the-editor):
 * - canonical storage = ProseMirror JSON as produced by `editor.getJSON()`
 *   (schema-normalised: every attr present, schema key order, adjacent text
 *   nodes merged). `serializeDoc` gives the exact string stored in SQLite;
 * - Markdown = deterministic export (GFM + `[[task:<uuid>]]`);
 * - plain text = derived, for full-text search only.
 */

export type DocJSON = JSONContent & { type: 'doc' };

interface Toolkit {
  extensions: AnyExtension[];
  schema: Schema;
  markdown: MarkdownManager;
}

let toolkit: Toolkit | null = null;

/**
 * Adjacent lists of the same kind (two bullet lists, two ordered lists, two
 * checklists) would MERGE when the exported Markdown is read back, because a
 * blank line does not end a CommonMark list. The CommonMark-recommended fix is
 * an empty HTML comment between them. This pseudo-node exists only during
 * Markdown (de)serialisation; it is NOT part of the editor schema.
 */
const LIST_SEPARATOR = 'listSeparator';
const LIST_SEPARATOR_MARKDOWN = '<!-- -->';
const MERGEABLE_LISTS = new Set(['bulletList', 'orderedList', CHECKLIST_NODE_NAME]);

const ListSeparatorMarkdown = Extension.create({
  name: LIST_SEPARATOR,
  markdownTokenName: LIST_SEPARATOR,
  markdownTokenizer: {
    name: LIST_SEPARATOR,
    level: 'block',
    start: (src: string) => src.search(/^ {0,3}<!--\s*-->/m),
    tokenize: (src: string) => {
      const match = /^ {0,3}<!--\s*-->[ \t]*(?:\n|$)/.exec(src);
      return match ? { type: LIST_SEPARATOR, raw: match[0] } : undefined;
    },
  },
  // Produces no content: the separator only keeps the two lists apart.
  parseMarkdown: () => [],
  renderMarkdown: () => LIST_SEPARATOR_MARKDOWN,
});

function separateAdjacentLists(node: JSONContent): JSONContent {
  if (!node.content) return node;
  const content: JSONContent[] = [];
  let previousType: string | undefined;
  for (const child of node.content) {
    if (
      child.type !== undefined &&
      child.type === previousType &&
      MERGEABLE_LISTS.has(child.type)
    ) {
      content.push({ type: LIST_SEPARATOR });
    }
    content.push(separateAdjacentLists(child));
    previousType = child.type;
  }
  return { ...node, content };
}

/**
 * Lazily built, shared schema + Markdown manager. Uses a PRIVATE `Marked`
 * instance: @tiptap/markdown registers custom tokenizers with `marked.use()`,
 * which would otherwise mutate the global `marked` singleton every time a
 * MarkdownManager is created.
 */
function getToolkit(): Toolkit {
  if (toolkit === null) {
    const extensions = createEditorExtensions();
    toolkit = {
      extensions,
      schema: getSchema(extensions),
      markdown: new MarkdownManager({
        extensions: [...extensions, ListSeparatorMarkdown],
        indentation: { style: 'space', size: 2 },
        // A Marked instance exposes the API MarkdownManager uses (Lexer, defaults, use, setOptions).
        marked: new Marked() as unknown as typeof marked,
      }),
    };
  }
  return toolkit;
}

/**
 * A taskRef carries no formatting: marks on it (e.g. bold applied over a
 * selection) cannot be expressed in `[[task:<uuid>]]` and are not stored.
 */
function stripTaskRefMarks(node: JSONContent): JSONContent {
  if (node.type === TASK_REF_NODE_NAME) {
    const { marks: _marks, ...rest } = node;
    return rest;
  }
  return node.content ? { ...node, content: node.content.map(stripTaskRefMarks) } : node;
}

/**
 * Validate against the schema and return the canonical JSON (same shape as
 * `editor.getJSON()`). Throws on unknown node/mark types or invalid content —
 * callers must NOT autosave over stored content that fails here.
 */
export function normalizeDoc(json: JSONContent): DocJSON {
  const node = getToolkit().schema.nodeFromJSON(stripTaskRefMarks(json));
  node.check();
  if (node.type.name !== 'doc') {
    throw new Error(`Expected a doc node, got "${node.type.name}"`);
  }
  return node.toJSON() as DocJSON;
}

/** The exact string persisted in SQLite. */
export function serializeDoc(json: JSONContent): string {
  return JSON.stringify(normalizeDoc(json));
}

export function isSameDoc(a: JSONContent, b: JSONContent): boolean {
  return serializeDoc(a) === serializeDoc(b);
}

export function emptyDoc(): DocJSON {
  return normalizeDoc({ type: 'doc', content: [{ type: 'paragraph' }] });
}

/** Deterministic Markdown export. */
/**
 * Drops link marks whose href fails the URL policy (text is kept). Every way *into* the editor
 * already validates links; this guards exports of stored JSON that was forged or damaged.
 */
function withoutUnsafeLinks(node: JSONContent): JSONContent {
  const marks = node.marks?.filter(
    (mark) => mark.type !== 'link' || isSafeHref(mark.attrs?.['href']),
  );
  return {
    ...node,
    ...(node.marks ? { marks } : {}),
    ...(node.content ? { content: node.content.map(withoutUnsafeLinks) } : {}),
  };
}

export function jsonToMarkdown(json: JSONContent): string {
  const markdown = getToolkit().markdown.serialize(
    separateAdjacentLists(withoutUnsafeLinks(normalizeDoc(json))),
  );
  return markdown.endsWith('\n') || markdown === '' ? markdown : `${markdown}\n`;
}

/**
 * Markdown import (note → document conversion, future import). Output is
 * canonical JSON. Constructs outside the schema degrade without losing text:
 * H4–H6 become paragraphs, raw HTML is filtered by the schema (see htmlToJson).
 */
export function markdownToJson(markdown: string): DocJSON {
  const parsed = getToolkit().markdown.parse(markdown);
  if (!parsed.content || parsed.content.length === 0) {
    return emptyDoc();
  }
  return normalizeDoc(parsed);
}

/**
 * HTML import (paste from outside, drag & drop). Parsed by the schema's
 * parseHTML rules: unknown elements (script, img, iframe, style…) and unknown
 * attributes (on*, style…) cannot be represented and are dropped.
 * Requires a DOM (`window.DOMParser`) — available in the webview and jsdom.
 */
export function htmlToJson(html: string): DocJSON {
  return normalizeDoc(generateJSON(html, getToolkit().extensions));
}

export interface PlainTextOptions {
  /**
   * Text to index for a task reference. Default: nothing. Tasks are indexed
   * by their own FTS rows; copying the title here would go stale on rename.
   */
  taskRefText?: (taskId: string) => string;
}

const TEXTBLOCKS = new Set(['paragraph', 'heading', 'codeBlock']);

function inlineText(nodes: readonly JSONContent[], options: PlainTextOptions): string {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += node.text ?? '';
    } else if (node.type === 'hardBreak') {
      out += '\n';
    } else if (node.type === TASK_REF_NODE_NAME) {
      const id = normalizeTaskId(node.attrs?.['taskId']);
      if (id !== null && options.taskRefText) {
        out += options.taskRefText(id);
      }
    } else if (node.content) {
      out += inlineText(node.content, options);
    }
  }
  return out;
}

function blockLines(node: JSONContent, options: PlainTextOptions, lines: string[]): void {
  if (node.type !== undefined && TEXTBLOCKS.has(node.type)) {
    const text = inlineText(node.content ?? [], options);
    if (text.trim() !== '') {
      lines.push(text);
    }
    return;
  }
  for (const child of node.content ?? []) {
    blockLines(child, options, lines);
  }
}

/**
 * Derived plain text for full-text search: one line per non-empty text block,
 * no Markdown syntax, no task data. Pure JSON walk (no DOM, no schema), so the
 * same algorithm can be ported to Rust if the core ever needs to re-index.
 */
export function jsonToPlainText(json: JSONContent, options: PlainTextOptions = {}): string {
  const lines: string[] = [];
  blockLines(json, options, lines);
  return lines.join('\n');
}

/**
 * Ids of REAL tasks referenced by the document (unique, document order).
 * Only `taskRef` nodes count; editorial checklist items are never tasks.
 */
export function extractTaskRefIds(json: JSONContent): string[] {
  const ids = new Set<string>();
  const visit = (node: JSONContent): void => {
    if (node.type === TASK_REF_NODE_NAME) {
      const id = normalizeTaskId(node.attrs?.['taskId']);
      if (id !== null) ids.add(id);
    }
    node.content?.forEach(visit);
  };
  visit(json);
  return [...ids];
}
