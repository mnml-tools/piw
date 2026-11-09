import { history, historyKeymap, insertNewline, standardKeymap } from '@codemirror/commands';
import { Language, defineLanguageFacet, syntaxTree } from '@codemirror/language';
import {
  Annotation,
  EditorSelection,
  EditorState,
  Transaction,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import { GFM, parser } from '@lezer/markdown';
import checkboxStyles from '@/components/ui/Checkbox/Checkbox.module.css';
import {
  continueList,
  indentList,
  toggleTaskLine,
  toggleWrap,
  type TextEdit,
} from '@/lib/markdown';
import styles from './MarkdownEditor.module.css';

/**
 * Live Markdown for quick notes (docs/ui-design-system.md §10): the text stays plain
 * Markdown, byte for byte, but every line renders its formatting. Only the lines the caret or
 * selection touch, while the editor has focus, show their markers (muted), so the source is one
 * click away and is never rewritten. Task list items (`- [ ]`, `- [x]`) render as the kit's
 * small checkbox, which toggles the `x` in the text.
 */

/**
 * CommonMark with the GitHub extensions (task lists, strikethrough, autolinks, tables). Built on
 * the Lezer parser directly: `@codemirror/lang-markdown` would bundle the HTML, CSS and
 * JavaScript grammars into every sticky for nested code highlighting it does not use here.
 */
const gfmMarkdown = new Language(defineLanguageFacet(), parser.configure(GFM), [], 'markdown');

/** Marks a transaction that adopts text from elsewhere: not an edit to save or undo. */
const external = Annotation.define<boolean>();

/** Applies `toggleTaskLine` to every line the selection touches, as one undoable edit. */
function toggleTasks(view: EditorView, lines?: number[]): boolean {
  const { state } = view;
  if (state.readOnly) return false;
  const numbers = new Set(lines);
  if (!lines) {
    for (const range of state.selection.ranges) {
      const last = state.doc.lineAt(range.to).number;
      for (let n = state.doc.lineAt(range.from).number; n <= last; n += 1) numbers.add(n);
    }
  }
  const changes = [...numbers].flatMap((n) => {
    const line = state.doc.line(n);
    const next = toggleTaskLine(line.text);
    return next === null ? [] : [{ from: line.from, to: line.to, insert: next }];
  });
  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: 'input.toggle' });
  return true;
}

/** Runs one of the plain-text note helpers (`markdown.ts`) on the main selection. */
function runEdit(view: EditorView, edit: (value: string, from: number, to: number) => unknown) {
  if (view.state.readOnly) return false;
  const { from, to } = view.state.selection.main;
  const result = edit(view.state.doc.toString(), from, to);
  if (result === 'none') return true;
  if (!result) return false;
  const { start, end, text, selectionStart, selectionEnd } = result as TextEdit;
  view.dispatch({
    changes: { from: start, to: end, insert: text },
    selection: EditorSelection.range(selectionStart, selectionEnd),
    scrollIntoView: true,
    userEvent: 'input',
  });
  return true;
}

const noteKeymap = keymap.of([
  // A plain newline otherwise: the default Enter would trim the line's trailing spaces.
  { key: 'Enter', run: (view) => runEdit(view, continueList) || insertNewline(view) },
  { key: 'Tab', run: (view) => runEdit(view, (v, s, e) => indentList(v, s, e, false)) },
  { key: 'Shift-Tab', run: (view) => runEdit(view, (v, s, e) => indentList(v, s, e, true)) },
  { key: 'Mod-b', run: (view) => runEdit(view, (v, s, e) => toggleWrap(v, s, e, '**')) },
  { key: 'Mod-i', run: (view) => runEdit(view, (v, s, e) => toggleWrap(v, s, e, '_')) },
  { key: 'Mod-Enter', run: (view) => toggleTasks(view) },
]);

// ---- Rendering ----

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly label: string,
  ) {
    super();
  }

  override eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.label === this.label;
  }

  /** The kit Checkbox's markup (`size="sm"`), so it draws exactly like a task's box. */
  toDOM() {
    const root = document.createElement('span');
    root.className = `${styles.liveCheck} ${checkboxStyles.root} ${checkboxStyles.sm}`;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = checkboxStyles.input ?? '';
    input.checked = this.checked;
    input.tabIndex = -1;
    input.setAttribute('aria-label', this.label);
    const box = document.createElement('span');
    box.className = checkboxStyles.box ?? '';
    box.setAttribute('aria-hidden', 'true');
    box.innerHTML = `<svg class="${checkboxStyles.check}" viewBox="0 0 16 16" focusable="false"><path d="M3.75 8.25 6.75 11.25 12.25 5" pathLength="1"/></svg>`;
    root.append(input, box);
    return root;
  }

  override ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  override eq() {
    return true;
  }

  toDOM() {
    const bullet = document.createElement('span');
    bullet.className = styles.liveBullet ?? '';
    bullet.setAttribute('aria-hidden', 'true');
    return bullet;
  }
}

class RuleWidget extends WidgetType {
  override eq() {
    return true;
  }

  toDOM() {
    const rule = document.createElement('span');
    rule.className = styles.liveRule ?? '';
    rule.setAttribute('aria-hidden', 'true');
    return rule;
  }
}

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const rule = Decoration.replace({ widget: new RuleWidget() });
const mark = (className: string | undefined) => Decoration.mark({ class: className ?? '' });
const line = (className: string | undefined) => Decoration.line({ class: className ?? '' });

const syntaxMark = mark(styles.liveMark);
const strong = mark(styles.liveStrong);
const emphasis = mark(styles.liveEmphasis);
const strike = mark(styles.liveStrike);
const code = mark(styles.liveCode);
const link = mark(styles.liveLink);
const done = mark(styles.liveDone);
const headingLines = [
  line(styles.liveH1),
  line(styles.liveH2),
  line(styles.liveH3),
  line(styles.liveH3),
  line(styles.liveH3),
  line(styles.liveH3),
];
const itemLine = line(styles.liveItem);
const quoteLine = line(styles.liveQuote);
const codeLine = line(styles.liveCodeBlock);

/** Line numbers that show their Markdown: those under the selection, while focused. */
function revealedLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  const { doc, selection } = view.state;
  for (const range of selection.ranges) {
    const last = doc.lineAt(range.to).number;
    for (let n = doc.lineAt(range.from).number; n <= last; n += 1) lines.add(n);
  }
  return lines;
}

function decorate(view: EditorView): DecorationSet {
  const { state } = view;
  const { doc } = state;
  const revealed = revealedLines(view);
  const shows = (pos: number) => revealed.has(doc.lineAt(pos).number);
  const found: Range<Decoration>[] = [];
  const add = (decoration: Decoration, from: number, to = from) =>
    found.push(decoration.range(from, to));

  /** Hides a marker and the spaces after it (`# `, `> `). */
  const hideLeading = (node: SyntaxNode) => {
    let to = node.to;
    const end = doc.lineAt(node.from).to;
    while (to < end && doc.sliceString(to, to + 1) === ' ') to += 1;
    add(hidden, node.from, to);
  };

  /** Marker nodes inside inline formatting: muted when shown, hidden otherwise. */
  const marker = (node: SyntaxNode) => {
    add(syntaxMark, node.from, node.to);
    if (!shows(node.from)) add(hidden, node.from, node.to);
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (ref) => {
        const node = ref.node;
        const heading = /^ATXHeading(\d)$/.exec(node.name);
        if (heading) {
          add(headingLines[Number(heading[1]) - 1]!, doc.lineAt(node.from).from);
          for (const child of node.getChildren('HeaderMark')) {
            add(syntaxMark, child.from, child.to);
            if (shows(child.from)) continue;
            if (child.from === node.from) hideLeading(child);
            else {
              let start = child.from;
              while (start > node.from && doc.sliceString(start - 1, start) === ' ') start -= 1;
              add(hidden, start, child.to);
            }
          }
          return;
        }
        switch (node.name) {
          case 'StrongEmphasis':
            add(strong, node.from, node.to);
            return;
          case 'Emphasis':
            add(emphasis, node.from, node.to);
            return;
          case 'Strikethrough':
            add(strike, node.from, node.to);
            return;
          case 'InlineCode':
            add(code, node.from, node.to);
            return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
            marker(node);
            return;
          case 'CodeMark':
            if (node.parent?.name === 'InlineCode') marker(node);
            else add(syntaxMark, node.from, node.to);
            return;
          case 'CodeInfo':
            add(syntaxMark, node.from, node.to);
            return;
          case 'URL':
            // A bare or <autolink> URL; a link's own URL is handled with the link.
            if (node.parent?.name !== 'Link') add(link, node.from, node.to);
            return;
          case 'Link': {
            const marks = node.getChildren('LinkMark');
            const open = marks[0];
            const close = marks.find((m) => doc.sliceString(m.from, m.to) === ']');
            if (!open || !close) return;
            add(link, open.to, close.from);
            add(syntaxMark, open.from, open.to);
            add(syntaxMark, close.from, node.to);
            if (!shows(node.from)) {
              add(hidden, open.from, open.to);
              add(hidden, close.from, node.to);
            }
            return;
          }
          case 'ListItem': {
            const listMark = node.getChild('ListMark');
            if (!listMark) return;
            const taskMarker = node.getChild('Task')?.getChild('TaskMarker');
            const shown = shows(listMark.from);
            const lineFrom = doc.lineAt(listMark.from).from;
            // A top-level rendered item hangs its wrapped lines under its text.
            const hang = () => {
              if (listMark.from === lineFrom) add(itemLine, lineFrom);
            };
            add(syntaxMark, listMark.from, listMark.to);
            if (taskMarker) {
              const checked = doc.sliceString(taskMarker.from + 1, taskMarker.from + 2) !== ' ';
              const task = node.getChild('Task')!;
              let textFrom = taskMarker.to;
              while (textFrom < task.to && doc.sliceString(textFrom, textFrom + 1) === ' ') {
                textFrom += 1;
              }
              // Only the item's own line: lines typed under it without a marker stay plain.
              const textTo = Math.min(task.to, doc.lineAt(textFrom).to);
              if (checked && textFrom < textTo) add(done, textFrom, textTo);
              add(syntaxMark, taskMarker.from, taskMarker.to);
              if (!shown) {
                const label = doc.sliceString(textFrom, doc.lineAt(textFrom).to).trim();
                const widget = new CheckboxWidget(checked, label);
                add(Decoration.replace({ widget }), listMark.from, textFrom);
                hang();
              }
            } else if (!shown && node.parent?.name === 'BulletList') {
              let to = listMark.to;
              while (to < node.to && doc.sliceString(to, to + 1) === ' ') to += 1;
              add(bullet, listMark.from, to);
              hang();
            }
            return;
          }
          case 'Blockquote': {
            const last = doc.lineAt(node.to).number;
            for (let n = doc.lineAt(node.from).number; n <= last; n += 1) {
              add(quoteLine, doc.line(n).from);
            }
            return;
          }
          case 'QuoteMark':
            add(syntaxMark, node.from, node.to);
            if (!shows(node.from)) hideLeading(node);
            return;
          case 'HorizontalRule':
            if (!shows(node.from)) add(rule, node.from, node.to);
            return;
          case 'FencedCode':
          case 'CodeBlock': {
            const last = doc.lineAt(node.to).number;
            for (let n = doc.lineAt(node.from).number; n <= last; n += 1) {
              add(codeLine, doc.line(n).from);
            }
            return;
          }
        }
      },
    });
  }
  return Decoration.set(found, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorate(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = decorate(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      // A click on a rendered checkbox toggles that item and leaves the caret where it was.
      mousedown(event, view) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.closest(`.${styles.liveCheck}`)) {
          return false;
        }
        event.preventDefault();
        return toggleTasks(view, [view.state.doc.lineAt(view.posAtDOM(target)).number]);
      },
    },
  },
);

export interface LiveMarkdownOptions {
  /** Every edit made here (not text adopted with `replaceText`). */
  onEdit: (text: string) => void;
  /** Esc without modifiers; when absent, Esc does nothing here. */
  onEscape?: () => void;
}

/** The note editor: Markdown with live formatting and the note helpers. */
export function liveMarkdown({ onEdit, onEscape }: LiveMarkdownOptions): Extension {
  return [
    history(),
    EditorState.tabSize.of(2),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'true' }),
    gfmMarkdown,
    noteKeymap,
    keymap.of([
      {
        key: 'Escape',
        run: () => {
          if (!onEscape) return false;
          onEscape();
          return true;
        },
      },
    ]),
    keymap.of([...historyKeymap, ...standardKeymap]),
    livePreview,
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      if (update.transactions.some((tr) => tr.annotation(external))) return;
      onEdit(update.state.doc.toString());
    }),
  ];
}

/**
 * Adopts text from elsewhere (another window, a reload). Only the differing middle is replaced,
 * so the caret keeps its place; it is not an edit, so it is neither saved nor undoable.
 */
export function replaceText(view: EditorView, text: string): void {
  const current = view.state.doc.toString();
  if (current === text) return;
  let start = 0;
  const max = Math.min(current.length, text.length);
  while (start < max && current[start] === text[start]) start += 1;
  let end = 0;
  while (end < max - start && current[current.length - 1 - end] === text[text.length - 1 - end]) {
    end += 1;
  }
  view.dispatch({
    changes: {
      from: start,
      to: current.length - end,
      insert: text.slice(start, text.length - end),
    },
    annotations: [external.of(true), Transaction.addToHistory.of(false)],
  });
}
