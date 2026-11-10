import {
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  Decoration,
  ViewPlugin,
  WidgetType,
  keymap,
  showTooltip,
  type DecorationSet,
  type Tooltip,
  type ViewUpdate,
} from '@codemirror/view';
import { formatDueDate } from '@/lib/dates';
import { suggestDates, type DateSuggestion } from '@/lib/vault/date-words';
import { DONE_SIGN, DUE_SIGN, applyTaskChange, lastDate, taskBox } from '@/lib/vault/tasks';
import { completionDate, frontMatterEnd, revealedLines } from './live-markdown';
import styles from './MarkdownEditor.module.css';

/**
 * Task dates in the vault editor (docs/vault-format.md §3, "Typing dates"):
 *
 * - A recognised `📅 date` renders as a small chip ("Tomorrow", "12 Nov") unless its line is
 *   being edited; an overdue chip is marked, and a click on a chip opens the date menu. A done
 *   task's `✅ date` is hidden until then.
 * - On a task line, `@` opens date suggestions that filter as you type (`@tom`, `@fri`,
 *   `@nov 12`); Enter or Tab writes the choice as `📅 YYYY-MM-DD`, replacing any due date.
 * - Mod+D opens the same menu for the task under the caret, with "No date" when it has one.
 *
 * Today comes from the `completionDate` facet, so the editor and the views agree on it.
 */

const NO_DATE = 'No date';

interface DateMenu {
  /** `type`: a typed `@query` between `from` and `to`; `pick`: Mod+D or a chip. */
  mode: 'type' | 'pick';
  line: number;
  from: number;
  to: number;
  options: DateSuggestion[];
  selected: number;
}

const setMenu = StateEffect.define<DateMenu | null>();
const moveSelection = StateEffect.define<number>();

function today(state: EditorState): string {
  const provide = state.facet(completionDate);
  return provide ? provide() : new Date().toISOString().slice(0, 10);
}

/** `@query` right before the caret on a task line, and its suggestions. */
function typedMenu(state: EditorState): DateMenu | null {
  const range = state.selection.main;
  if (!range.empty) return null;
  const line = state.doc.lineAt(range.head);
  if (!taskBox(line.text) || line.from < frontMatterEnd(state.doc)) return null;
  const before = line.text.slice(0, range.head - line.from);
  const match = /(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/.exec(before);
  if (!match) return null;
  const options = suggestDates(match[1]!, today(state));
  if (options.length === 0) return null;
  return {
    mode: 'type',
    line: line.number,
    from: range.head - match[1]!.length - 1,
    to: range.head,
    options,
    selected: 0,
  };
}

function pickMenu(state: EditorState, lineNumber: number): DateMenu | null {
  const line = state.doc.line(lineNumber);
  const box = taskBox(line.text);
  if (!box) return null;
  const options = suggestDates('', today(state));
  if (lastDate(line.text.slice(box.boxAt + 3), DUE_SIGN))
    options.push({ label: NO_DATE, date: null });
  return { mode: 'pick', line: lineNumber, from: line.to, to: line.to, options, selected: 0 };
}

const menuField = StateField.define<DateMenu | null>({
  create: () => null,
  update(menu, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setMenu)) return effect.value;
      if (effect.is(moveSelection) && menu) {
        const count = menu.options.length;
        return { ...menu, selected: (menu.selected + effect.value + count) % count };
      }
    }
    if (!tr.docChanged && !tr.selection) return menu;
    // Mod+D's menu closes on any edit or caret move; a typed one follows the typing.
    return menu?.mode === 'pick' ? null : typedMenu(tr.state);
  },
  provide: (field) => showTooltip.from(field, (menu) => (menu ? tooltip(menu) : null)),
});

/** Writes the chosen date on the menu's line (replacing a typed `@query`). */
function accept(view: EditorView, menu: DateMenu, option: DateSuggestion): void {
  const line = view.state.doc.line(menu.line);
  let text = line.text;
  let caret = line.to;
  if (menu.mode === 'type') {
    const start = menu.from - line.from;
    const end = menu.to - line.from;
    const glue = text[start - 1] === ' ' && text[end] === ' ' ? 1 : 0;
    text = text.slice(0, start - glue) + text.slice(end);
    caret = line.from + start - glue;
  }
  const box = taskBox(text);
  if (!box) return;
  const next = applyTaskChange(text, box.boxAt, { kind: 'due', due: option.date });
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: next },
    selection: { anchor: Math.min(caret, line.from + next.length) },
    effects: setMenu.of(null),
    userEvent: 'input.date',
  });
}

function tooltip(menu: DateMenu): Tooltip {
  return {
    pos: menu.from,
    above: false,
    create: (view) => {
      const dom = document.createElement('div');
      dom.className = styles.dateMenu ?? '';
      dom.setAttribute('role', 'listbox');
      dom.setAttribute('aria-label', 'Due date');
      menu.options.forEach((option, index) => {
        const row = document.createElement('div');
        row.className = styles.dateOption ?? '';
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(index === menu.selected));
        const label = document.createElement('span');
        label.textContent = option.label;
        row.append(label);
        if (option.date) {
          const date = document.createElement('span');
          date.className = styles.dateHint ?? '';
          date.textContent = option.date;
          row.append(date);
        }
        row.addEventListener('mousedown', (event) => {
          event.preventDefault();
          accept(view, menu, option);
        });
        dom.append(row);
      });
      return { dom };
    },
  };
}

const menuKeys = Prec.highest(
  keymap.of([
    {
      key: 'ArrowDown',
      run: (view) => move(view, 1),
    },
    {
      key: 'ArrowUp',
      run: (view) => move(view, -1),
    },
    { key: 'Enter', run: acceptSelected },
    { key: 'Tab', run: acceptSelected },
    {
      key: 'Escape',
      run: (view) => {
        if (!view.state.field(menuField)) return false;
        view.dispatch({ effects: setMenu.of(null) });
        return true;
      },
    },
    {
      key: 'Mod-d',
      run: (view) => {
        if (view.state.readOnly) return false;
        const menu = pickMenu(
          view.state,
          view.state.doc.lineAt(view.state.selection.main.head).number,
        );
        if (!menu) return false;
        view.dispatch({ effects: setMenu.of(menu) });
        return true;
      },
    },
  ]),
);

function move(view: EditorView, step: number): boolean {
  if (!view.state.field(menuField)) return false;
  view.dispatch({ effects: moveSelection.of(step) });
  return true;
}

function acceptSelected(view: EditorView): boolean {
  const menu = view.state.field(menuField);
  const option = menu?.options[menu.selected];
  if (!menu || !option) return false;
  accept(view, menu, option);
  return true;
}

// ---- Chips ----

class DateChip extends WidgetType {
  constructor(
    readonly label: string,
    readonly tone: 'due' | 'overdue',
    readonly line: number,
  ) {
    super();
  }

  override eq(other: DateChip) {
    return other.label === this.label && other.tone === this.tone && other.line === this.line;
  }

  toDOM() {
    const chip = document.createElement('span');
    chip.className = styles.dateChip ?? '';
    chip.dataset.tone = this.tone;
    chip.dataset.line = String(this.line);
    chip.textContent = this.label;
    return chip;
  }

  override ignoreEvent() {
    return false;
  }
}

function chips(view: EditorView): DecorationSet {
  const { state } = view;
  const revealed = revealedLines(view);
  const now = today(state);
  const metadataEnd = frontMatterEnd(state.doc);
  const found: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n += 1) {
      const line = state.doc.line(n);
      const box = taskBox(line.text);
      if (!box || revealed.has(n) || line.from < metadataEnd) continue;
      const offset = box.boxAt + 3;
      const rest = line.text.slice(offset);
      const due = lastDate(rest, DUE_SIGN);
      const done = lastDate(rest, DONE_SIGN);
      const spans = [
        due && {
          span: due,
          chip: new DateChip(
            formatDueDate(due.date, now),
            !box.checked && due.date < now ? 'overdue' : 'due',
            n,
          ),
        },
        // A done task's `✅ date` is bookkeeping: hidden until its line is edited.
        done && { span: done, chip: null },
      ].filter((s) => s !== null);
      for (const { span, chip } of spans.sort((a, b) => a.span.start - b.span.start)) {
        found.push(
          Decoration.replace(chip ? { widget: chip } : {}).range(
            line.from + offset + span.start,
            line.from + offset + span.end,
          ),
        );
      }
    }
  }
  return Decoration.set(found, true);
}

const chipPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = chips(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.viewportChanged
      ) {
        this.decorations = chips(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      mousedown(event, view) {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.dataset.line) return false;
        if (!target.classList.contains(styles.dateChip ?? '')) return false;
        const menu = pickMenu(view.state, Number(target.dataset.line));
        if (!menu || view.state.readOnly) return false;
        event.preventDefault();
        view.dispatch({ effects: setMenu.of(menu) });
        return true;
      },
    },
  },
);

/** Chips, `@` suggestions and Mod+D for task dates; pass `today` (the local date). */
export function taskDates(provideToday: () => string): Extension {
  return [completionDate.of(provideToday), menuField, menuKeys, chipPlugin];
}
