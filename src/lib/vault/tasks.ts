/**
 * Tasks in a note, as `src-tauri/src/vault/parse.rs` reads them (docs/vault-format.md §3), and
 * the same line edits as `vault/tasks.rs`. Both sides pass `fixtures/vault.expected.json` and
 * `fixtures/task-edits.json`, so the note panel (which reads the live text) and the task views
 * (which read Rust's index) always agree.
 */
import type { SyntaxNode } from '@lezer/common';
import { GFM, parser } from '@lezer/markdown';
import { isISODate } from '@/components/ui/DateQuickPicker/dates';
import type { VaultTaskChange } from '@/lib/ipc/bindings/VaultTaskChange';

export const DUE_SIGN = '📅';
export const DONE_SIGN = '✅';
const VARIATION_SELECTOR = '️';

const markdown = parser.configure(GFM);

export interface NoteTask {
  /** 1-based line of the box. */
  line: number;
  checked: boolean;
  /** The first line's text, without the recognised dates. */
  text: string;
  due: string | null;
  done: string | null;
  /** The closest heading above. */
  heading: string | null;
  /** Line of the task directly enclosing this one. */
  parentLine: number | null;
  /** The line as written: the guard of a line edit. */
  lineText: string;
  /** Where the `[` of the box is in `lineText`. */
  boxAt: number;
}

export interface NoteHeading {
  line: number;
  level: number;
  text: string;
}

/** Length of a YAML front matter block at the very top (`---` lines around it), or 0. */
export function frontMatterLength(text: string): number {
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) return 0;
  const close = /\r?\n(?:---|\.\.\.)[ \t]*(?=\r?\n|$)/g;
  close.lastIndex = 3;
  const match = close.exec(text);
  return match ? match.index + match[0].length : 0;
}

export interface DateSpan {
  start: number;
  end: number;
  date: string;
}

/** The last `sign date` in `text` whose date exists (docs/vault-format.md §3, "Dates"). */
export function lastDate(text: string, sign: string): DateSpan | null {
  for (
    let at = text.lastIndexOf(sign);
    at !== -1;
    at = at === 0 ? -1 : text.lastIndexOf(sign, at - 1)
  ) {
    let i = at + sign.length;
    if (text[i] === VARIATION_SELECTOR) i += 1;
    let j = i;
    while (text[j] === ' ' || text[j] === '\t') j += 1;
    if (j === i) continue;
    const candidate = text.slice(j, j + 10);
    const after = text[j + 10];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate) || !isISODate(candidate)) continue;
    if (after !== undefined && !/\s/.test(after)) continue;
    return { start: at, end: j + 10, date: candidate };
  }
  return null;
}

/** Removes `span` and the spaces or tabs before it. */
function cut(text: string, span: DateSpan): string {
  const start = text.slice(0, span.start).replace(/[ \t]+$/, '').length;
  return text.slice(0, start) + text.slice(span.end);
}

export function extractDates(text: string): {
  text: string;
  due: string | null;
  done: string | null;
} {
  const due = lastDate(text, DUE_SIGN);
  const done = lastDate(text, DONE_SIGN);
  let out = text;
  for (const span of [due, done]
    .filter((s): s is DateSpan => s !== null)
    .sort((a, b) => b.start - a.start)) {
    out = cut(out, span);
  }
  return { text: out.trim(), due: due?.date ?? null, done: done?.date ?? null };
}

/** `-`, `*`, `+`, `1.` or `1)` at the end, after whitespace or the line start. */
const BULLET_END = /(?:^|\s)(?:[-*+]|\d{1,9}[.)])$/;

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function lineIndex(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

function within(node: SyntaxNode | null, name: string): boolean {
  for (let n = node; n; n = n.parent) if (n.name === name) return true;
  return false;
}

/** The tasks and headings of a note, in reading order. */
export function parseNote(input: string): { tasks: NoteTask[]; headings: NoteHeading[] } {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const metadata = frontMatterLength(text);
  // Front matter is not Markdown: blank it out, keeping every offset and line.
  const source = metadata
    ? text.slice(0, metadata).replace(/[^\r\n]/g, ' ') + text.slice(metadata)
    : text;
  const starts = lineStarts(text);
  const lineText = (index: number) => {
    const end = index + 1 < starts.length ? starts[index + 1]! - 1 : text.length;
    return text.slice(starts[index], end).replace(/\r$/, '');
  };
  const tasks: NoteTask[] = [];
  const headings: NoteHeading[] = [];
  const taskLineOfItem = new Map<number, number>();
  let heading: string | null = null;

  markdown.parse(source).iterate({
    enter: (ref) => {
      const level = /^(?:ATX|Setext)Heading(\d)$/.exec(ref.name);
      if (level) {
        const index = lineIndex(starts, ref.from);
        const raw = lineText(index);
        const title = (
          ref.name.startsWith('ATX')
            ? raw.replace(/^\s*#{1,6}(?:[ \t]+|$)/, '').replace(/(?:^|[ \t]+)#+[ \t]*$/, '')
            : raw
        ).trim();
        heading = title || null;
        headings.push({ line: index + 1, level: Number(level[1]), text: title });
        return;
      }
      if (ref.name !== 'Task') return;
      const node = ref.node;
      const marker = node.getChild('TaskMarker');
      const item = node.parent;
      if (!marker || !item || within(node, 'Blockquote')) return;
      const index = lineIndex(starts, marker.from);
      const start = starts[index]!;
      const before = text.slice(start, marker.from);
      const bullet = before.replace(/[ \t]+$/, '');
      if (bullet.length === before.length || !BULLET_END.test(bullet)) return;
      const line = lineText(index);
      const boxAt = marker.from - start;
      const box = /^\[([ xX])\]/.exec(line.slice(boxAt));
      const rest = line.slice(boxAt + 3);
      if (!box || !/^[ \t]/.test(rest) || rest.trim() === '') return;
      const outer = item.parent?.parent;
      const dates = extractDates(rest);
      const task: NoteTask = {
        line: index + 1,
        checked: box[1] !== ' ',
        text: dates.text,
        due: dates.due,
        done: dates.done,
        heading,
        parentLine: outer?.name === 'ListItem' ? (taskLineOfItem.get(outer.from) ?? null) : null,
        lineText: line,
        boxAt,
      };
      tasks.push(task);
      taskLineOfItem.set(item.from, task.line);
    },
  });
  return { tasks, headings };
}

/** `line` with `change` applied (docs/vault-format.md §3, "What Piw writes"). */
export function applyTaskChange(line: string, boxAt: number, change: VaultTaskChange): string {
  const head = line.slice(0, boxAt + 3);
  const rest = line.slice(boxAt + 3);
  if (!head.endsWith(']') || head.length !== boxAt + 3) throw new Error('that line is not a task');
  switch (change.kind) {
    case 'check': {
      const box = `${head.slice(0, boxAt + 1)}${change.checked ? 'x' : ' '}]`;
      const done = lastDate(rest, DONE_SIGN);
      const left = done ? cut(rest, done) : rest;
      return change.checked
        ? `${box}${left.replace(/[ \t]+$/, '')} ${DONE_SIGN} ${change.today}`
        : `${box}${left}`;
    }
    case 'due': {
      const due = lastDate(rest, DUE_SIGN);
      if (change.due === null) return head + (due ? cut(rest, due) : rest);
      const token = `${DUE_SIGN} ${change.due}`;
      if (due) return head + rest.slice(0, due.start) + token + rest.slice(due.end);
      const done = lastDate(rest, DONE_SIGN);
      if (done) {
        const at = rest.slice(0, done.start).replace(/[ \t]+$/, '').length;
        return `${head}${rest.slice(0, at)} ${token}${rest.slice(at)}`;
      }
      return `${head}${rest.replace(/[ \t]+$/, '')} ${token}`;
    }
    case 'text': {
      const text = change.text.trim();
      if (!text || /[\r\n]/.test(text)) throw new Error('a task needs one line of text');
      const starts = [lastDate(rest, DUE_SIGN), lastDate(rest, DONE_SIGN)]
        .filter((s): s is DateSpan => s !== null)
        .map((s) => s.start);
      return starts.length
        ? `${head} ${text} ${rest.slice(Math.min(...starts))}`
        : `${head} ${text}`;
    }
  }
}

/** A line's box, if it is a task line: where its `[` is and whether it is ticked. */
export function taskBox(line: string): { boxAt: number; checked: boolean } | null {
  const match = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)/.exec(line);
  return match ? { boxAt: match[1]!.length, checked: match[2] !== ' ' } : null;
}
