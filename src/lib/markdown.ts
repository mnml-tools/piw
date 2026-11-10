/**
 * The only editing helpers of the note editor (docs/ui-design-system.md §10): Mod+B / Mod+I wrap
 * the selection in Markdown markers, Enter continues list lines, Tab / Shift+Tab indent list
 * lines. Pure functions that return a replacement for a range, so the editor applies it as one
 * undoable change.
 */

/** Replace `value.slice(start, end)` with `text`, then select `selectionStart…selectionEnd`. */
export interface TextEdit {
  start: number;
  end: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

const LIST_LINE = /^([ \t]*)([-*]|(\d+)([.)]))[ ](\[[ xX]\][ ])?/;
const INDENT = '  ';
const LINE_MARKERS =
  /^(?:#{1,6}(?:\s+|$)|>\s*|[-*+](?:\s+|$)|\d{1,9}[.)](?:\s+|$)|\[[ xX]\](?:\s+|$))+/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const TITLE_MAX = 80;

/**
 * The text's lines as the note list reads them: trimmed, without leading Markdown markers
 * (headings, quotes, list bullets and numbers, task boxes), skipping empty lines and rules. The
 * same rule as the database's titles and excerpts (`domain/text.rs`).
 */
export function textLines(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => !RULE.test(line))
    .map((line) => line.trim().replace(LINE_MARKERS, '').trim())
    .filter((line) => line !== '');
}

/**
 * Display title of a quick note: the first text line (`textLines`), cut to 80 characters.
 * Display only — the text is never rewritten (docs/ui-design-system.md §17 rule 4). The database
 * returns the same value as `displayTitle`; this is for text that may not be saved yet.
 */
export function inferTitle(text: string): string {
  return (textLines(text)[0] ?? '').slice(0, TITLE_MAX);
}

function lineStartAt(value: string, index: number): number {
  return value.lastIndexOf('\n', index - 1) + 1;
}

function lineEndAt(value: string, index: number): number {
  const end = value.indexOf('\n', index);
  return end === -1 ? value.length : end;
}

/** Wraps the selection in `marker` (`**`, `_`), or unwraps it when it is already wrapped. */
export function toggleWrap(value: string, start: number, end: number, marker: string): TextEdit {
  const size = marker.length;
  const selected = value.slice(start, end);
  const outside =
    value.slice(Math.max(0, start - size), start) === marker &&
    value.slice(end, end + size) === marker;
  if (outside) {
    return {
      start: start - size,
      end: end + size,
      text: selected,
      selectionStart: start - size,
      selectionEnd: end - size,
    };
  }
  const inside =
    selected.length >= size * 2 && selected.startsWith(marker) && selected.endsWith(marker);
  if (inside) {
    const inner = selected.slice(size, -size);
    return { start, end, text: inner, selectionStart: start, selectionEnd: start + inner.length };
  }
  return {
    start,
    end,
    text: `${marker}${selected}${marker}`,
    selectionStart: start + size,
    selectionEnd: end + size,
  };
}

/**
 * Enter on a list line: continues it (`- `, `* `, `1. ` → `2. `, `- [ ] `). Enter on an empty
 * item removes its marker. Returns null when Enter should behave normally.
 */
export function continueList(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const lineStart = lineStartAt(value, start);
  const lineEnd = lineEndAt(value, start);
  const line = value.slice(lineStart, lineEnd);
  const match = LIST_LINE.exec(line);
  if (!match) return null;
  const markerEnd = lineStart + match[0].length;
  if (start < markerEnd) return null;
  if (line.slice(match[0].length).trim() === '') {
    return {
      start: lineStart,
      end: lineEnd,
      text: '',
      selectionStart: lineStart,
      selectionEnd: lineStart,
    };
  }
  const [, indent = '', bullet = '', number, delimiter = '.', checkbox] = match;
  const marker = number ? `${Number(number) + 1}${delimiter}` : bullet;
  const insert = `\n${indent}${marker} ${checkbox ? '[ ] ' : ''}`;
  const caret = start + insert.length;
  return { start, end, text: insert, selectionStart: caret, selectionEnd: caret };
}

/**
 * Tab / Shift+Tab on list lines: indents or outdents every selected line. Returns null when a
 * selected line is not a list line (Tab then moves focus as usual, so there is no trap) and
 * `'none'` when the lines are list lines but there is nothing to outdent.
 */
export function indentList(
  value: string,
  start: number,
  end: number,
  outdent: boolean,
): TextEdit | 'none' | null {
  const blockStart = lineStartAt(value, start);
  const blockEnd = lineEndAt(value, end > start && value[end - 1] === '\n' ? end - 1 : end);
  const lines = value.slice(blockStart, blockEnd).split('\n');
  if (!lines.every((line) => LIST_LINE.test(line))) return null;

  let firstDelta = 0;
  let totalDelta = 0;
  const changed = lines.map((line, index) => {
    let next = line;
    if (!outdent) next = INDENT + line;
    else if (line.startsWith(INDENT)) next = line.slice(INDENT.length);
    else if (line.startsWith('\t') || line.startsWith(' ')) next = line.slice(1);
    const delta = next.length - line.length;
    if (index === 0) firstDelta = delta;
    totalDelta += delta;
    return next;
  });
  if (totalDelta === 0) return 'none';
  return {
    start: blockStart,
    end: blockEnd,
    text: changed.join('\n'),
    selectionStart: Math.max(blockStart, start + firstDelta),
    selectionEnd: Math.max(blockStart, end + totalDelta),
  };
}

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](?=\s|$)/;
const LIST_PREFIX = /^(\s*(?:[-*+]|\d+[.)])\s+)/;

/** Progress of a note's tasks (the sticky strip), counted by `src/lib/vault/tasks.ts`. */
export interface TaskProgress {
  done: number;
  total: number;
}

/**
 * Mod+Enter on one line: ticks or unticks a task item, turns a list item into a task and any
 * other line into a task item. An empty line is left alone (null).
 */
export function toggleTaskLine(line: string): string | null {
  const task = TASK_LINE.exec(line);
  if (task) {
    const [, prefix = '', mark] = task;
    return `${prefix}[${mark === ' ' ? 'x' : ' '}]${line.slice(task[0].length)}`;
  }
  if (line.trim() === '') return null;
  const list = LIST_PREFIX.exec(line);
  if (list) return `${list[0]}[ ] ${line.slice(list[0].length)}`;
  const indent = /^\s*/.exec(line)?.[0] ?? '';
  return `${indent}- [ ] ${line.slice(indent.length)}`;
}

/**
 * A line's inline Markdown as plain text, for lists that show a task or a heading outside the
 * editor: links keep their text, `[[Note|alias]]` its alias (else the note), and emphasis, code
 * and strike markers go. Display only; the file keeps its Markdown.
 */
export function inlineText(text: string): string {
  return (
    text
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|~~)(?=\S)(.+?)(?<=\S)\1/g, '$2')
      .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, '$1')
      // `_` marks emphasis only at word edges (CommonMark): snake_case stays.
      .replace(/(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
  );
}
